"use client";

import { useEffect, useState } from "react";
import { TeaLabDurationSlider } from "@/components/tea-lab/TeaLabBrewSliders";
import {
  activateVintageTimerFeedback,
  playVintageTimerEvent,
  playVintageTimerHaptic,
  preloadVintageTimerFeedback
} from "@/lib/vintage-timer-feedback";

const DEFAULT_INFUSION_SECONDS = 2 * 60;
const OPENING_FILM_DURATION_MS = 8_000;
const REDUCED_MOTION_DURATION_MS = 700;
const OPENING_FADE_DURATION_MS = 260;

export function InfusionTimeMachineApp() {
  const [durationSeconds, setDurationSeconds] = useState<number | null>(DEFAULT_INFUSION_SECONDS);
  const [filmComplete, setFilmComplete] = useState(false);
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [feedbackEngaging, setFeedbackEngaging] = useState(false);
  const [openingRemoved, setOpeningRemoved] = useState(false);
  const openingCanClose = filmComplete && feedbackReady;

  useEffect(() => {
    void preloadVintageTimerFeedback();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const playDuration = reduceMotion ? REDUCED_MOTION_DURATION_MS : OPENING_FILM_DURATION_MS;
    const filmTimer = window.setTimeout(() => setFilmComplete(true), playDuration);

    return () => window.clearTimeout(filmTimer);
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
    setDurationSeconds(seconds);
  }

  function wakeAudio() {
    void activateVintageTimerFeedback();
  }

  async function engageFeedback() {
    if (feedbackReady || feedbackEngaging) return;
    setFeedbackEngaging(true);
    playVintageTimerHaptic("mechanicalEngage");
    await activateVintageTimerFeedback();
    setFeedbackReady(true);
    setFeedbackEngaging(false);
    playVintageTimerEvent("buttonDown");
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
        id="infusion-time-machine"
        label="Infusion Time Machine"
        valueSeconds={durationSeconds}
        preferredUnit="seconds"
        enableTimer
        onChange={updateDuration}
      />
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
        <span>{feedbackEngaging ? "Engaging sound…" : "Tap to engage sound"}</span>
        <small>{filmComplete ? "Required before entering" : "Preparing the time machine"}</small>
      </button> : null}
      <span className="sr-only" role="status" aria-live="polite">
        {feedbackReady
          ? "Sound is ready. Preparing the timer and controls."
          : "Tap to engage sound before entering the timer."}
      </span>
    </section> : null}
  </main>;
}
