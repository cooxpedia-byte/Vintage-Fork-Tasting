"use client";

import { useEffect, useState } from "react";
import { TeaLabDurationSlider } from "@/components/tea-lab/TeaLabBrewSliders";
import {
  activateVintageTimerFeedback,
  isVintageTimerSoundEnabled,
  playVintageTimerEvent,
  playVintageTimerHaptic,
  preloadVintageTimerFeedback,
  setVintageTimerSoundEnabled,
  VINTAGE_TIMER_SOUND_EVENT
} from "@/lib/vintage-timer-feedback";

const DEFAULT_INFUSION_SECONDS = 2 * 60;
const OPENING_FILM_DURATION_MS = 8_000;
const REDUCED_MOTION_DURATION_MS = 700;
const OPENING_FADE_DURATION_MS = 260;

const TEA_TIMER_PRESETS = [
  { id: "green", label: "Green", seconds: 2 * 60 },
  { id: "white", label: "White", seconds: 4 * 60 },
  { id: "oolong", label: "Oolong", seconds: 3 * 60 },
  { id: "black", label: "Black", seconds: 4 * 60 },
  { id: "pu-erh", label: "Pu-erh", seconds: 3 * 60 },
  { id: "herbal", label: "Herbal", seconds: 5 * 60 },
  { id: "rooibos", label: "Rooibos", seconds: 5 * 60 }
] as const;

function presetDurationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function InfusionTimeMachineApp() {
  const [durationSeconds, setDurationSeconds] = useState<number | null>(DEFAULT_INFUSION_SECONDS);
  const [filmComplete, setFilmComplete] = useState(false);
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [feedbackEngaging, setFeedbackEngaging] = useState(false);
  const [openingRemoved, setOpeningRemoved] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [timerRevision, setTimerRevision] = useState(0);
  const openingCanClose = filmComplete && feedbackReady;

  useEffect(() => {
    void preloadVintageTimerFeedback();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const playDuration = reduceMotion ? REDUCED_MOTION_DURATION_MS : OPENING_FILM_DURATION_MS;
    const filmTimer = window.setTimeout(() => setFilmComplete(true), playDuration);

    return () => window.clearTimeout(filmTimer);
  }, []);

  useEffect(() => {
    const readSoundPreference = () => setSoundEnabled(isVintageTimerSoundEnabled());
    const restoreFeedback = () => {
      readSoundPreference();
      if (isVintageTimerSoundEnabled()) void activateVintageTimerFeedback();
    };
    const handleSoundPreference = (event: Event) => {
      setSoundEnabled((event as CustomEvent<boolean>).detail);
    };
    const handleVisibility = () => {
      if (!document.hidden) restoreFeedback();
    };

    readSoundPreference();
    window.addEventListener(VINTAGE_TIMER_SOUND_EVENT, handleSoundPreference);
    window.addEventListener("pageshow", restoreFeedback);
    window.addEventListener("focus", restoreFeedback);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener(VINTAGE_TIMER_SOUND_EVENT, handleSoundPreference);
      window.removeEventListener("pageshow", restoreFeedback);
      window.removeEventListener("focus", restoreFeedback);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!openingCanClose) return;
    const removeTimer = window.setTimeout(
      () => setOpeningRemoved(true),
      OPENING_FADE_DURATION_MS
    );

    return () => window.clearTimeout(removeTimer);
  }, [openingCanClose]);

  function updateDuration(seconds: number | null) {
    setSelectedPreset(null);
    setDurationSeconds(seconds);
  }

  function wakeAudio() {
    if (isVintageTimerSoundEnabled()) void activateVintageTimerFeedback();
  }

  async function engageFeedback() {
    if (feedbackReady || feedbackEngaging) return;
    setFeedbackEngaging(true);
    playVintageTimerHaptic("mechanicalEngage");
    if (soundEnabled) await activateVintageTimerFeedback();
    setFeedbackReady(true);
    setFeedbackEngaging(false);
    playVintageTimerEvent("buttonDown");
  }

  function selectPreset(preset: typeof TEA_TIMER_PRESETS[number]) {
    playVintageTimerEvent("buttonDown", "selectionDetent");
    setSelectedPreset(preset.id);
    setDurationSeconds(preset.seconds);
    setTimerRevision(revision => revision + 1);
    window.setTimeout(
      () => playVintageTimerEvent("buttonRelease"),
      58
    );
  }

  async function toggleSound() {
    const next = !soundEnabled;
    if (!next) {
      playVintageTimerEvent("buttonDown", "softPress");
      window.setTimeout(() => {
        playVintageTimerEvent("buttonRelease", "mechanicalEngage");
        setSoundEnabled(false);
        void setVintageTimerSoundEnabled(false);
      }, 58);
      return;
    }

    playVintageTimerHaptic("softPress");
    setSoundEnabled(true);
    await setVintageTimerSoundEnabled(true);
    playVintageTimerEvent("buttonDown");
    window.setTimeout(
      () => playVintageTimerEvent("buttonRelease", "mechanicalEngage"),
      58
    );
  }

  return <main
    id="main-content"
    className="infusion-time-machine-page"
    onPointerDownCapture={wakeAudio}
  >
    <h1 className="sr-only">Vintage Fork Infusion Time Machine</h1>
    <section
      className={`infusion-time-machine-shell${openingCanClose ? "" : " is-prewarming"}`}
      aria-label="Infusion timer"
      aria-hidden={openingCanClose ? undefined : true}
    >
      <TeaLabDurationSlider
        key={`time-machine-${timerRevision}`}
        id="infusion-time-machine"
        label="Infusion Time Machine"
        valueSeconds={durationSeconds}
        preferredUnit="seconds"
        enableTimer
        soundEnabled={soundEnabled}
        onSoundToggle={() => void toggleSound()}
        onChange={updateDuration}
      />
    </section>
    <section className="infusion-time-machine-presets" aria-label="Tea timer presets">
      <div className="infusion-time-machine-preset-heading" aria-hidden="true">
        <span className="infusion-time-machine-program-lamp" />
        <strong>Tea programs</strong>
        <small>Select a precision steeping cycle</small>
      </div>
      <div className="infusion-time-machine-preset-bank">
        {TEA_TIMER_PRESETS.map(preset => <button
          className="infusion-time-machine-preset"
          type="button"
          data-feedback-silent="true"
          data-tea={preset.id}
          aria-pressed={selectedPreset === preset.id}
          aria-label={`${preset.label} tea preset, ${presetDurationLabel(preset.seconds)}`}
          onClick={() => selectPreset(preset)}
          key={preset.id}
        >
          <span className="infusion-time-machine-preset-lamp" aria-hidden="true" />
          <span>{preset.label}</span>
          <strong>{presetDurationLabel(preset.seconds)}</strong>
          <span className="infusion-time-machine-preset-gear" aria-hidden="true" />
        </button>)}
      </div>
    </section>
    {!openingRemoved ? <section
      className={`infusion-time-machine-opening${openingCanClose ? " is-fading" : filmComplete ? " is-awaiting-gesture" : ""}`}
      aria-label="Infusion Time Machine opening"
    >
      <video
        className="infusion-time-machine-opening-film"
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/brand/loading-wallpaper.jpg"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source
          src="/brand/opening-animation-app.mp4"
          type='video/mp4; codecs="hvc1"'
        />
        <source
          src="/brand/opening-animation-web.mp4"
          type='video/mp4; codecs="avc1"'
        />
      </video>
      {!feedbackReady ? <button
        className="infusion-time-machine-engage"
        type="button"
        onClick={() => void engageFeedback()}
        disabled={feedbackEngaging}
      >
        <span>{feedbackEngaging ? "Engaging…" : soundEnabled ? "Tap to engage sound" : "Enter time machine"}</span>
        <small>{filmComplete ? "Required before entering" : "Preparing the time machine"}</small>
      </button> : null}
      <span className="sr-only" role="status" aria-live="polite">
        {feedbackReady
          ? "Sound is ready. Preparing the timer and controls."
          : soundEnabled
            ? "Tap to engage sound before entering the timer."
            : "Tap to enter the timer."}
      </span>
    </section> : null}
  </main>;
}
