"use client";

import { useEffect, useState } from "react";
import { TeaLabDurationSlider } from "@/components/tea-lab/TeaLabBrewSliders";
import {
  activateVintageTimerFeedback,
  preloadVintageTimerFeedback
} from "@/lib/vintage-timer-feedback";

const DEFAULT_INFUSION_SECONDS = 2 * 60;
const OPENING_FILM_DURATION_MS = 8_000;
const REDUCED_MOTION_DURATION_MS = 700;
const OPENING_FADE_DURATION_MS = 260;

type OpeningStage = "playing" | "fading" | "complete";

export function InfusionTimeMachineApp() {
  const [durationSeconds, setDurationSeconds] = useState<number | null>(DEFAULT_INFUSION_SECONDS);
  const [openingStage, setOpeningStage] = useState<OpeningStage>("playing");

  useEffect(() => {
    void preloadVintageTimerFeedback();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const playDuration = reduceMotion ? REDUCED_MOTION_DURATION_MS : OPENING_FILM_DURATION_MS;
    let removeTimer: number | undefined;
    const fadeTimer = window.setTimeout(() => {
      setOpeningStage("fading");
      removeTimer = window.setTimeout(
        () => setOpeningStage("complete"),
        OPENING_FADE_DURATION_MS
      );
    }, playDuration);

    return () => {
      window.clearTimeout(fadeTimer);
      if (removeTimer !== undefined) window.clearTimeout(removeTimer);
    };
  }, []);

  function updateDuration(seconds: number | null) {
    setDurationSeconds(seconds);
  }

  function wakeAudio() {
    void activateVintageTimerFeedback();
  }

  return <main
    id="main-content"
    className="infusion-time-machine-page"
    onPointerDownCapture={wakeAudio}
  >
    <h1 className="sr-only">Vintage Fork Infusion Time Machine</h1>
    <section
      className={`infusion-time-machine-shell${openingStage === "playing" ? " is-prewarming" : ""}`}
      aria-label="Infusion timer"
      aria-hidden={openingStage === "playing" ? true : undefined}
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
    {openingStage !== "complete" ? <section
      className={`infusion-time-machine-opening${openingStage === "fading" ? " is-fading" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Warming the Infusion Time Machine"
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
      <span className="sr-only">Preparing the timer, sound, and controls.</span>
    </section> : null}
  </main>;
}
