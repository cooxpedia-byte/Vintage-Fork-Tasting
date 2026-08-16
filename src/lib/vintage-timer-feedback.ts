import {
  INTERFACE_FEEDBACK_STORAGE_KEY,
  resolveInterfaceFeedbackEnabled
} from "@/lib/interface-feedback";

export const VINTAGE_TIMER_AUDIO_EVENTS = [
  "wheelDetent",
  "wheelSettle",
  "buttonDown",
  "buttonRelease",
  "startMechanical",
  "startRelay",
  "timerCompletePrimary",
  "timerCompleteSecondary"
] as const;

export const VINTAGE_TIMER_HAPTIC_EVENTS = [
  "selectionDetent",
  "wheelSettle",
  "softPress",
  "mechanicalEngage",
  "startTimer",
  "timerComplete"
] as const;

export type VintageTimerAudioEvent = typeof VINTAGE_TIMER_AUDIO_EVENTS[number];
export type VintageTimerHapticEvent = typeof VINTAGE_TIMER_HAPTIC_EVENTS[number];

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  VintageForkMobile?: { postMessage: (message: string) => void };
};

type FeedbackOptions = {
  delayMs?: number;
  detentIntervalMs?: number;
  volumeScale?: number;
};

type HapticOptions = {
  count?: number;
  intervalMs?: number;
  delayMs?: number;
};

const AUDIO_ROOT = "/audio/vintage-timer";
const audioFiles: Record<VintageTimerAudioEvent, readonly string[]> = {
  wheelDetent: [`${AUDIO_ROOT}/wheel-detent-a.wav`],
  wheelSettle: [`${AUDIO_ROOT}/wheel-settle.wav`],
  buttonDown: [`${AUDIO_ROOT}/button-down.wav`],
  buttonRelease: [`${AUDIO_ROOT}/button-release.wav`],
  startMechanical: [`${AUDIO_ROOT}/start-mechanical.wav`],
  startRelay: [`${AUDIO_ROOT}/start-relay.wav`],
  timerCompletePrimary: [`${AUDIO_ROOT}/timer-complete-primary.wav`],
  timerCompleteSecondary: [`${AUDIO_ROOT}/timer-complete-secondary.wav`]
};

const eventGain: Record<VintageTimerAudioEvent, number> = {
  wheelDetent: .22,
  wheelSettle: .24,
  buttonDown: .2,
  buttonRelease: .2,
  startMechanical: .22,
  startRelay: .2,
  timerCompletePrimary: .34,
  timerCompleteSecondary: .3
};

const fallbackVibration: Record<VintageTimerHapticEvent, number | number[]> = {
  selectionDetent: 5,
  wheelSettle: [8, 30, 4],
  softPress: 6,
  mechanicalEngage: 5,
  startTimer: [12, 76, 5],
  timerComplete: [16, 480, 10]
};

let detentSequence = 0;

export function vintageTimerPitchRate(sequence: number) {
  void sequence;
  return 1;
}

export function vintageTimerDetentPlan(count: number, intervalMs: number) {
  const safeCount = Math.max(1, Math.abs(Math.trunc(count)));
  return {
    count: safeCount,
    spacingMs: Math.max(64, Math.min(96, Math.round(intervalMs || 64)))
  };
}

function feedbackEnabled() {
  try {
    return resolveInterfaceFeedbackEnabled(
      window.localStorage.getItem(INTERFACE_FEEDBACK_STORAGE_KEY),
      true
    );
  } catch {
    return true;
  }
}

class VintageTimerAudioManager {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private preloadPromise: Promise<void> | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private activeWheelSource: AudioBufferSourceNode | null = null;

  preload() {
    if (typeof window === "undefined") return Promise.resolve();
    if (this.preloadPromise) return this.preloadPromise;
    this.preloadPromise = this.loadBuffers().catch(() => undefined);
    return this.preloadPromise;
  }

  async activate() {
    const context = this.getContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
    await this.preload();
  }

  play(event: VintageTimerAudioEvent, options: FeedbackOptions = {}) {
    if (typeof window === "undefined" || !feedbackEnabled()) return;
    const context = this.getContext();
    if (!context) return;
    const files = audioFiles[event];
    const sequence = event === "wheelDetent" ? detentSequence++ : 0;
    const file = files[sequence % files.length];
    const buffer = this.buffers.get(file);
    if (!buffer) {
      void this.preload().then(() => {
        if (this.buffers.has(file)) this.play(event, options);
      });
      return;
    }

    const start = () => {
      if (event === "wheelDetent" && this.activeWheelSource) {
        try { this.activeWheelSource.stop(); } catch { /* The previous detent has already ended. */ }
        this.activeWheelSource = null;
      }
      while (this.activeSources.length >= 6) {
        try { this.activeSources.shift()?.stop(); } catch { /* The oldest voice has already ended. */ }
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const interval = Math.max(12, options.detentIntervalMs ?? 46);
      const velocityGain = event === "wheelDetent" ? Math.max(.58, Math.min(1, interval / 42)) : 1;
      source.buffer = buffer;
      source.playbackRate.value = event === "wheelDetent" ? vintageTimerPitchRate(sequence) : 1;
      gain.gain.value = eventGain[event] * velocityGain * (options.volumeScale ?? 1);
      source.connect(gain).connect(context.destination);
      const when = context.currentTime + Math.max(0, options.delayMs ?? 0) / 1000;
      this.activeSources.push(source);
      if (event === "wheelDetent") this.activeWheelSource = source;
      source.addEventListener("ended", () => {
        this.activeSources = this.activeSources.filter(candidate => candidate !== source);
        if (this.activeWheelSource === source) this.activeWheelSource = null;
        source.disconnect();
        gain.disconnect();
      }, { once: true });
      source.start(when);
    };

    if (context.state === "suspended") void context.resume().then(start).catch(() => undefined);
    else start();
  }

  private getContext() {
    if (this.context && this.context.state !== "closed") return this.context;
    const Constructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    this.context = Constructor ? new Constructor() : null;
    return this.context;
  }

  private async loadBuffers() {
    const context = this.getContext();
    if (!context) return;
    const files = [...new Set(Object.values(audioFiles).flat())];
    await Promise.all(files.map(async file => {
      const response = await fetch(file, { cache: "force-cache" });
      if (!response.ok) return;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(file, buffer);
    }));
  }
}

export const vintageTimerAudio = new VintageTimerAudioManager();

let pendingWheelPulses = 0;
let wheelCadenceMs = 64;
let wheelCadenceTimer: number | null = null;
let lastWheelPulseAt = 0;

function stopVintageWheelCadence() {
  pendingWheelPulses = 0;
  if (wheelCadenceTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(wheelCadenceTimer);
  }
  wheelCadenceTimer = null;
}

function scheduleVintageWheelPulse() {
  if (typeof window === "undefined" || wheelCadenceTimer !== null || pendingWheelPulses === 0) return;
  const elapsed = lastWheelPulseAt ? window.performance.now() - lastWheelPulseAt : wheelCadenceMs;
  const waitMs = Math.max(0, wheelCadenceMs - elapsed);
  wheelCadenceTimer = window.setTimeout(() => {
    wheelCadenceTimer = null;
    if (pendingWheelPulses === 0) return;
    pendingWheelPulses -= 1;
    lastWheelPulseAt = window.performance.now();
    vintageTimerAudio.play("wheelDetent", { detentIntervalMs: wheelCadenceMs });
    playVintageTimerHaptic("selectionDetent", { count: 1, intervalMs: wheelCadenceMs });
    scheduleVintageWheelPulse();
  }, waitMs);
}

export function preloadVintageTimerFeedback() {
  return vintageTimerAudio.preload();
}

export function activateVintageTimerFeedback() {
  return vintageTimerAudio.activate().catch(() => undefined);
}

export function playVintageTimerHaptic(event: VintageTimerHapticEvent, options: HapticOptions = {}) {
  if (typeof window === "undefined" || !feedbackEnabled()) return;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bridge = (window as AudioContextWindow).VintageForkMobile;
    if (bridge) {
      const send = () => bridge.postMessage(JSON.stringify({
        type: "vintageTimerFeedback",
        event,
        count: Math.max(1, Math.trunc(options.count ?? 1)),
        intervalMs: Math.max(12, Math.trunc(options.intervalMs ?? 40))
      }));
      if (options.delayMs) window.setTimeout(send, options.delayMs);
      else send();
      return;
    }
    if (typeof navigator.vibrate !== "function") return;
    const vibrate = () => navigator.vibrate(fallbackVibration[event]);
    if (options.delayMs) window.setTimeout(vibrate, options.delayMs);
    else vibrate();
  } catch { /* Haptics remain an optional enhancement. */ }
}

export function playVintageTimerEvent(
  audioEvent: VintageTimerAudioEvent,
  hapticEvent?: VintageTimerHapticEvent,
  options: FeedbackOptions & HapticOptions = {}
) {
  if (audioEvent === "wheelSettle") stopVintageWheelCadence();
  vintageTimerAudio.play(audioEvent, options);
  if (hapticEvent) playVintageTimerHaptic(hapticEvent, options);
}

export function playVintageWheelDetents(count: number, intervalMs: number) {
  const plan = vintageTimerDetentPlan(count, intervalMs);
  wheelCadenceMs = plan.spacingMs;
  pendingWheelPulses += plan.count;
  scheduleVintageWheelPulse();
}
