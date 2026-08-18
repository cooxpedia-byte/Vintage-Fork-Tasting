"use client";

import { useEffect, useRef, useState } from "react";
import { SplitFlapTimer } from "@/components/split-flap/SplitFlapTimer";
import { correctedNow } from "@/lib/live-timing";
import {
  sharedBrewCountdownMs,
  sharedBrewMilestone,
  sharedBrewPhase,
  sharedBrewRemainingMs,
  sharedBrewStatusCopy,
  type SharedBrew
} from "@/lib/shared-brewing";
import {
  activateVintageTimerFeedback,
  playVintageTimerEvent,
  preloadVintageTimerFeedback
} from "@/lib/vintage-timer-feedback";

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };

export function SharedBrewingTimer({
  brew,
  clockOffsetMs = 0,
  feedbackEnabled = false,
  compact = false
}: {
  brew: SharedBrew;
  clockOffsetMs?: number;
  feedbackEnabled?: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => correctedNow(Date.now(), clockOffsetMs));
  const [announcement, setAnnouncement] = useState("");
  const previousPhase = useRef<ReturnType<typeof sharedBrewPhase> | null>(null);
  const previousSeconds = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(correctedNow(Date.now(), clockOffsetMs));
    tick();
    const interval = window.setInterval(tick, 250);
    const foreground = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [clockOffsetMs, brew.id]);

  const phase = sharedBrewPhase(brew, now);
  const countdownMs = sharedBrewCountdownMs(brew, now);
  const remainingMs = sharedBrewRemainingMs(brew, now);
  const shownMs = phase === "countdown" ? countdownMs : remainingMs;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const countdownSeconds = Math.max(0, Math.ceil(countdownMs / 1000));

  useEffect(() => {
    if (!feedbackEnabled) return;
    void preloadVintageTimerFeedback();
  }, [feedbackEnabled]);

  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (!previous || !feedbackEnabled) return;
    if (previous === "countdown" && phase === "running") {
      void activateVintageTimerFeedback();
      playVintageTimerEvent("startMechanical", "startTimer", { volumeScale: .72 });
    }
    if (previous !== "complete" && phase === "complete") {
      void activateVintageTimerFeedback();
      playVintageTimerEvent("timerCompletePrimary", "timerComplete", { volumeScale: .78 });
      playVintageTimerEvent("timerCompleteChime", undefined, { volumeScale: .65, delayMs: 420 });
    }
  }, [feedbackEnabled, phase]);

  useEffect(() => {
    const next = sharedBrewMilestone(previousSeconds.current, seconds);
    previousSeconds.current = seconds;
    if (next) setAnnouncement(next);
  }, [seconds]);

  useEffect(() => {
    if (phase !== "running") return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await (navigator as WakeLockNavigator).wakeLock?.request("screen") ?? null;
        if (cancelled) await lock?.release();
      } catch { /* Wake lock is an optional enhancement. */ }
    };
    void request();
    return () => { cancelled = true; void lock?.release().catch(() => undefined); };
  }, [phase]);

  return <section className={`shared-brew-machine ${compact ? "shared-brew-machine-compact" : ""}`} data-phase={phase} data-final={phase==="running"&&seconds<=30?"true":"false"}>
    <div className="shared-brew-steam" aria-hidden="true"><span /><span /><span /></div>
    <div className="shared-brew-state">
      <span className="eyebrow">Infusion {brew.infusion_number}</span>
      <strong>{sharedBrewStatusCopy(phase)}</strong>
      {phase === "countdown" && <span className="shared-brew-countdown" aria-live="assertive">{countdownSeconds}</span>}
      {phase === "running"&&seconds<=30&&<span className="chip">Pour soon</span>}
    </div>
    <SplitFlapTimer
      totalSeconds={Math.ceil(shownMs / 1000)}
      powered={phase !== "cancelled"}
      running={phase === "running"}
      statusText={sharedBrewStatusCopy(phase)}
    />
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </section>;
}
