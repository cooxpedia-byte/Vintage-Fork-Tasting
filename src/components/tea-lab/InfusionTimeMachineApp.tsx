"use client";

import { useState } from "react";
import { TeaLabDurationSlider } from "@/components/tea-lab/TeaLabBrewSliders";
import { activateVintageTimerFeedback } from "@/lib/vintage-timer-feedback";

const DEFAULT_INFUSION_SECONDS = 2 * 60;

export function InfusionTimeMachineApp() {
  const [durationSeconds, setDurationSeconds] = useState<number | null>(DEFAULT_INFUSION_SECONDS);

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
    <section className="infusion-time-machine-shell" aria-label="Infusion timer">
      <TeaLabDurationSlider
        id="infusion-time-machine"
        label="Infusion Time Machine"
        valueSeconds={durationSeconds}
        preferredUnit="seconds"
        enableTimer
        onChange={updateDuration}
      />
    </section>
  </main>;
}
