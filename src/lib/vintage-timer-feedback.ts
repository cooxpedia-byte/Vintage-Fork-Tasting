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
  "timerCompleteSecondary",
  "timerCompleteChime"
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
export const VINTAGE_TIMER_SOUND_STORAGE_KEY = "vf:vintage-timer-sound";
export const VINTAGE_TIMER_SOUND_EVENT = "vf:vintage-timer-sound-changed";
export const VINTAGE_TIMER_COMPLETION_CHIME = {
  delayMs: 1180,
  durationMs: 2400,
  attackMs: 4,
  strikeIntervalMs: 1,
  bells: [
    { note: "C6", frequencyHz: 1046.502 },
    { note: "G6", frequencyHz: 1567.982 },
    { note: "E6", frequencyHz: 1318.51 }
  ]
} as const;
const audioFiles: Record<VintageTimerAudioEvent, readonly string[]> = {
  wheelDetent: [`${AUDIO_ROOT}/wheel-detent-a.wav`],
  wheelSettle: [`${AUDIO_ROOT}/wheel-settle.wav`],
  buttonDown: [`${AUDIO_ROOT}/button-down.wav`],
  buttonRelease: [`${AUDIO_ROOT}/button-release.wav`],
  startMechanical: [`${AUDIO_ROOT}/start-mechanical.wav`],
  startRelay: [`${AUDIO_ROOT}/start-relay.wav`],
  timerCompletePrimary: [`${AUDIO_ROOT}/timer-complete-primary.wav`],
  timerCompleteSecondary: [`${AUDIO_ROOT}/timer-complete-secondary.wav`],
  timerCompleteChime: []
};

const eventGain: Record<VintageTimerAudioEvent, number> = {
  wheelDetent: .22,
  wheelSettle: .24,
  buttonDown: .2,
  buttonRelease: .2,
  startMechanical: .22,
  startRelay: .2,
  timerCompletePrimary: .34,
  timerCompleteSecondary: .3,
  timerCompleteChime: .34
};

const fallbackVibration: Record<VintageTimerHapticEvent, number | number[]> = {
  selectionDetent: 16,
  wheelSettle: [8, 30, 4],
  softPress: 6,
  mechanicalEngage: 5,
  startTimer: [12, 76, 5],
  timerComplete: [16, 480, 10]
};

export function vintageTimerVibrationPattern(event: VintageTimerHapticEvent) {
  return fallbackVibration[event];
}

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

export function isVintageTimerSoundEnabled() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(VINTAGE_TIMER_SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

class VintageTimerAudioManager {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private bufferLoads = new Map<string, Promise<void>>();
  private preloadPromise: Promise<void> | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private activeWheelSource: AudioBufferSourceNode | null = null;
  private activeOscillators: OscillatorNode[] = [];

  preload() {
    if (typeof window === "undefined") return Promise.resolve();
    if (this.preloadPromise) return this.preloadPromise;
    this.preloadPromise = this.loadBuffers().catch(() => undefined);
    return this.preloadPromise;
  }

  async activate() {
    if (!isVintageTimerSoundEnabled()) return;
    const context = this.getContext();
    if (!context) return;
    if (context.state !== "running") await context.resume();
    await this.preload();
  }

  play(event: VintageTimerAudioEvent, options: FeedbackOptions = {}) {
    if (typeof window === "undefined" || !isVintageTimerSoundEnabled()) return;
    const mobileBridge = (window as AudioContextWindow).VintageForkMobile;
    if (mobileBridge && event !== "timerCompleteChime") {
      const send = () => {
        try {
          mobileBridge.postMessage(JSON.stringify({
            type: "vintageTimerAudio",
            event,
            delayMs: 0,
            detentIntervalMs: Math.max(12, options.detentIntervalMs ?? 46),
            volumeScale: Math.max(0, options.volumeScale ?? 1)
          }));
        } catch { /* Native audio remains an optional fast path. */ }
      };
      if (options.delayMs) window.setTimeout(send, options.delayMs);
      else send();
      return;
    }
    const context = this.getContext();
    if (!context) return;
    if (event === "timerCompleteChime") {
      const startChime = () => this.playCompletionChime(context, options);
      if (context.state !== "running") {
        void context.resume().then(() => {
          if (isVintageTimerSoundEnabled()) startChime();
        }).catch(() => undefined);
      } else startChime();
      return;
    }
    const files = audioFiles[event];
    const sequence = event === "wheelDetent" ? detentSequence++ : 0;
    const file = files[sequence % files.length];
    const buffer = this.buffers.get(file);
    if (!buffer) {
      void this.loadBuffer(file).then(() => {
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

    if (context.state !== "running") {
      void context.resume().then(() => {
        if (isVintageTimerSoundEnabled()) start();
      }).catch(() => undefined);
    }
    else start();
  }

  silence() {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch { /* The voice has already ended. */ }
    });
    this.activeSources = [];
    this.activeWheelSource = null;
    this.activeOscillators.forEach(oscillator => {
      try { oscillator.stop(); } catch { /* The chime voice has already ended. */ }
    });
    this.activeOscillators = [];
  }

  private playCompletionChime(context: AudioContext, options: FeedbackOptions) {
    const when = context.currentTime + Math.max(0, options.delayMs ?? 0) / 1000;
    const duration = VINTAGE_TIMER_COMPLETION_CHIME.durationMs / 1000;
    const volume = eventGain.timerCompleteChime * Math.max(0, options.volumeScale ?? 1);
    const strikes = VINTAGE_TIMER_COMPLETION_CHIME.bells.map((bell, noteIndex) => ({
      ...bell,
      offsetMs: noteIndex * VINTAGE_TIMER_COMPLETION_CHIME.strikeIntervalMs
    }));
    const master = context.createGain();
    const bellBody = context.createBiquadFilter();
    const presence = context.createDynamicsCompressor();
    master.gain.setValueAtTime(volume, when);
    bellBody.type = "lowpass";
    bellBody.frequency.setValueAtTime(7200, when);
    presence.threshold.setValueAtTime(-12, when);
    presence.knee.setValueAtTime(10, when);
    presence.ratio.setValueAtTime(3, when);
    presence.attack.setValueAtTime(.002, when);
    presence.release.setValueAtTime(.22, when);
    master.connect(bellBody).connect(presence).connect(context.destination);

    const partials = [
      { multiplier: 1, level: .9, decaySeconds: duration },
      { multiplier: 1.997, level: .38, decaySeconds: 2.15 },
      { multiplier: 2.706, level: .22, decaySeconds: 1.3 },
      { multiplier: 4.09, level: .11, decaySeconds: .82 },
      { multiplier: 5.42, level: .065, decaySeconds: .48 }
    ];
    let remaining = partials.length * strikes.length;
    strikes.forEach(strike => {
      const strikeAt = when + strike.offsetMs / 1000;
      partials.forEach(partial => {
        const oscillator = context.createOscillator();
        const partialGain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(
          strike.frequencyHz * partial.multiplier,
          strikeAt
        );
        partialGain.gain.setValueAtTime(.0001, strikeAt);
        partialGain.gain.exponentialRampToValueAtTime(
          partial.level,
          strikeAt + VINTAGE_TIMER_COMPLETION_CHIME.attackMs / 1000
        );
        partialGain.gain.exponentialRampToValueAtTime(
          Math.max(.0001, partial.level * .58),
          strikeAt + .055
        );
        partialGain.gain.exponentialRampToValueAtTime(
          .0001,
          strikeAt + partial.decaySeconds
        );
        oscillator.connect(partialGain).connect(master);
        this.activeOscillators.push(oscillator);
        oscillator.addEventListener("ended", () => {
          this.activeOscillators = this.activeOscillators.filter(candidate => candidate !== oscillator);
          oscillator.disconnect();
          partialGain.disconnect();
          remaining -= 1;
          if (remaining === 0) {
            master.disconnect();
            bellBody.disconnect();
            presence.disconnect();
          }
        }, { once: true });
        oscillator.start(strikeAt);
        oscillator.stop(strikeAt + duration + .04);
      });
    });
  }

  private getContext() {
    if (this.context && this.context.state !== "closed") return this.context;
    const Constructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    this.context = Constructor ? new Constructor() : null;
    return this.context;
  }

  private async loadBuffers() {
    const files = [...new Set(Object.values(audioFiles).flat())];
    const wheelDetentFile = audioFiles.wheelDetent[0];
    await this.loadBuffer(wheelDetentFile);
    await Promise.all(files
      .filter(file => file !== wheelDetentFile)
      .map(file => this.loadBuffer(file)));
  }

  private loadBuffer(file: string) {
    if (this.buffers.has(file)) return Promise.resolve();
    const pending = this.bufferLoads.get(file);
    if (pending) return pending;
    const context = this.getContext();
    if (!context) return Promise.resolve();
    const load = (async () => {
      const response = await fetch(file, { cache: "force-cache" });
      if (!response.ok) return;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(file, buffer);
    })().catch(() => undefined).finally(() => this.bufferLoads.delete(file));
    this.bufferLoads.set(file, load);
    return load;
  }
}

export const vintageTimerAudio = new VintageTimerAudioManager();

export function setVintageTimerSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return Promise.resolve();
  try {
    window.localStorage.setItem(VINTAGE_TIMER_SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch { /* Sound preferences are optional. */ }
  window.dispatchEvent(new CustomEvent<boolean>(VINTAGE_TIMER_SOUND_EVENT, { detail: enabled }));
  if (!enabled) {
    vintageTimerAudio.silence();
    return Promise.resolve();
  }
  return vintageTimerAudio.activate().catch(() => undefined);
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
    const vibrate = () => navigator.vibrate(vintageTimerVibrationPattern(event));
    if (options.delayMs) window.setTimeout(vibrate, options.delayMs);
    else vibrate();
  } catch { /* Haptics remain an optional enhancement. */ }
}

export function playVintageTimerEvent(
  audioEvent: VintageTimerAudioEvent,
  hapticEvent?: VintageTimerHapticEvent,
  options: FeedbackOptions & HapticOptions = {}
) {
  vintageTimerAudio.play(audioEvent, options);
  if (hapticEvent) playVintageTimerHaptic(hapticEvent, options);
}

export function playVintageWheelDetents(count: number, intervalMs: number) {
  const plan = vintageTimerDetentPlan(count, intervalMs);
  const playPulse = () => {
    vintageTimerAudio.play("wheelDetent", { detentIntervalMs: plan.spacingMs });
    playVintageTimerHaptic("selectionDetent", {
      count: 1,
      intervalMs: plan.spacingMs
    });
  };
  for (let pulse = 0; pulse < plan.count; pulse += 1) {
    if (pulse === 0 || typeof window === "undefined") playPulse();
    else window.setTimeout(playPulse, pulse * plan.spacingMs);
  }
}
