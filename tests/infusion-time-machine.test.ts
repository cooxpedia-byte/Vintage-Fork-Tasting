import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import InfusionTimeMachinePage from "@/app/infusion-time-machine/page";
import {
  InfusionTimeMachineApp,
  TEA_TIMER_PRESETS
} from "@/components/tea-lab/InfusionTimeMachineApp";
import {
  canCollapseLongInfusion,
  shouldShowLongInfusion,
  TeaLabDurationSlider
} from "@/components/tea-lab/TeaLabBrewSliders";
import {
  formatPresetDuration,
  nearestRadioDialIndex,
  presetMatchesDuration,
  radioDialIndexForKey,
  TeaPresetRadioDial,
  type TeaTimerPreset
} from "@/components/tea-lab/TeaPresetRadioDial";

describe("standalone Infusion Time Machine", () => {
  it("renders the exact shared Tea Lab mechanism with a two-minute default", () => {
    const html = renderToStaticMarkup(createElement(InfusionTimeMachineApp));

    expect(html).toContain("Vintage Fork Infusion Time Machine");
    expect(html).toContain('class="field tea-lab-slider-field tea-lab-duration-field"');
    expect(html).toContain('class="tea-lab-material-cheeks"');
    expect(html).not.toContain('id="infusion-time-machine-hours"');
    expect(html).toContain('id="infusion-time-machine-minutes"');
    expect(html).toContain('id="infusion-time-machine-seconds"');
    expect(html).toContain('class="mechanical-time-selector"');
    expect(html).toContain('data-columns="2"');
    expect(html).toContain('aria-label="Long Infusion, collapsed"');
    expect(html).toContain('aria-label="2 min"');
    expect(html).toContain("Start steep");
    expect(html).toContain("Good tea takes patience");
    expect(html).toContain('class="infusion-time-machine-opening"');
    expect(html).toContain('src="/brand/opening-animation-app.mp4"');
    expect(html).toContain('src="/brand/opening-animation-web.mp4"');
    expect(html).toContain('poster="/brand/loading-wallpaper.jpg"');
    expect(html).toContain("autoPlay");
    expect(html).toContain("muted");
    expect(html).toContain("playsInline");
    expect(html).toContain("Tap to engage sound");
    expect(html).toContain("Preparing the time machine");
    expect(html).toContain("Tea timer presets");
    TEA_TIMER_PRESETS.forEach(preset => {
      expect(html).toContain(preset.label);
      expect(html).toContain(formatPresetDuration(preset.seconds));
    });
    expect(html).toContain('class="tea-preset-radio-dial"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Green · 02:00");
    expect(html).not.toContain("degrees Celsius");
    expect(html).toContain("Mechanical sound on");
  });

  it("reveals the hours drum for a restored long infusion", () => {
    const html = renderToStaticMarkup(createElement(TeaLabDurationSlider, {
      id: "restored-long-infusion",
      label: "Infusion Time Machine",
      valueSeconds: 4 * 3600 + 3 * 60 + 2,
      preferredUnit: "seconds",
      enableTimer: true,
      onChange: () => undefined
    }));

    expect(html).toContain('id="restored-long-infusion-hours"');
    expect(html).toContain('id="restored-long-infusion-minutes"');
    expect(html).toContain('id="restored-long-infusion-seconds"');
    expect(html).toContain('data-columns="3"');
    expect(html).toContain('aria-label="Long Infusion, expanded"');
    expect(html).toContain('aria-valuetext="4 hours"');
  });

  it("never hides non-zero hours and allows zero hours to collapse", () => {
    expect(shouldShowLongInfusion(0, false)).toBe(false);
    expect(shouldShowLongInfusion(0, true)).toBe(true);
    expect(shouldShowLongInfusion(1, false)).toBe(true);
    expect(canCollapseLongInfusion(1)).toBe(false);
    expect(canCollapseLongInfusion(0)).toBe(true);
  });

  it("keeps each visible drum accessible and directly adjustable", () => {
    const html = renderToStaticMarkup(createElement(InfusionTimeMachineApp));

    expect(html).toContain('role="spinbutton"');
    expect(html).toContain('aria-label="Increase minutes"');
    expect(html).toContain('aria-label="Decrease minutes"');
    expect(html).toContain('aria-label="Increase seconds"');
    expect(html).toContain('aria-label="Decrease seconds"');
    expect(html).toContain('aria-valuetext="2 minutes"');
    expect(html).toContain('aria-valuetext="0 seconds"');
  });

  it("preloads the mechanical detent before the rest of the sound library", () => {
    const html = renderToStaticMarkup(createElement(InfusionTimeMachinePage));

    expect(html).toContain('rel="preload"');
    expect(html).toContain('href="/audio/vintage-timer/wheel-detent-a.wav"');
    expect(html).toContain('as="fetch"');
    expect(html).toContain('href="/brand/loading-wallpaper.jpg"');
    expect(html).toContain('as="image"');
  });

  it("keeps the continuous tea tuner fixed inside short embedded app viewports", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(/\.tea-preset-radio-dial\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.tea-preset-radio-dial\s*\{[^}]*bottom:\s*max\(/);
    expect(css).toMatch(/\.tea-preset-radio-scale\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
    expect(css).toMatch(/\.tea-preset-radio-station\s*\{[^}]*scroll-snap-align:\s*center/);
  });

  it("uses one responsive shared chassis instead of three selector cards", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(/\.mechanical-time-selector-bank\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.mechanical-time-selector-bank\[data-columns="3"\]\s*\{[^}]*repeat\(3/);
    expect(css).toMatch(/\.mechanical-number-drum-step\s*\{[^}]*min-height:\s*44px/);
    expect(css).toContain("@media (max-width: 390px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("uses a restrained structural frame hierarchy instead of nested decorative boxes", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(/\.tea-lab-duration-field\s*\{[^}]*--machine-brass-rim:[^}]*border:\s*3px solid var\(--machine-brass-rim\)/s);
    expect(css).toMatch(/\.tea-lab-duration-title::before\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.tea-lab-duration-copy::before,\.tea-lab-duration-copy::after\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.tea-lab-duration-nixie-tube\s*\{[^}]*border:\s*0;[^}]*var\(--machine-amber-light\)[^}]*box-shadow:\s*none/s);
    expect(css).toMatch(/\.mechanical-time-selector-bank\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.tea-lab-timer-tip\s*\{[^}]*border:\s*0;[^}]*border-top:\s*1px solid/s);
    expect(css).toMatch(/\.tea-preset-radio-window\s*\{[^}]*var\(--radio-aged-brass-dark\)/s);
  });

  it("uses one believable material system with a consistent upper-left light source", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain("--machine-light-angle: 145deg");
    expect(css).toContain("--machine-bakelite: #15130f");
    expect(css).toContain("--machine-aged-brass: #80643d");
    expect(css).toContain("--machine-polished-brass: #c49a4d");
    expect(css).toContain("--machine-glass-amber: #332313");
    expect(css).toContain("--machine-walnut: #25140e");
    expect(css).toContain("--machine-purple-enamel: #662461");
    expect(css).toContain("--machine-steel: #303436");
    expect(css).toMatch(/\.tea-lab-material-cheeks::before,\.tea-lab-material-cheeks::after\s*\{[^}]*var\(--machine-walnut/s);
    expect(css).toMatch(/\.tea-lab-timer-reset\s*\{[^}]*var\(--machine-steel\)[^}]*var\(--machine-steel-dark\)/s);
    expect(css).toMatch(/\.tea-preset-radio-pointer::before\s*\{[^}]*var\(--radio-purple\)/s);
  });

  it("snaps to real detents and supports first, last, previous, and next navigation", () => {
    expect(nearestRadioDialIndex(0, 300, [150, 270, 390])).toBe(0);
    expect(nearestRadioDialIndex(145, 300, [150, 270, 390])).toBe(1);
    expect(nearestRadioDialIndex(265, 300, [150, 270, 390])).toBe(2);
    expect(radioDialIndexForKey("ArrowLeft", 3, 7)).toBe(2);
    expect(radioDialIndexForKey("ArrowRight", 3, 7)).toBe(4);
    expect(radioDialIndexForKey("Home", 3, 7)).toBe(0);
    expect(radioDialIndexForKey("End", 3, 7)).toBe(6);
  });

  it("represents manual adjustments as custom without inventing temperature data", () => {
    const html = renderToStaticMarkup(createElement(TeaPresetRadioDial, {
      presets: TEA_TIMER_PRESETS,
      selectedPresetId: null,
      durationSeconds: 2 * 60 + 45,
      onSelect: () => undefined
    }));

    expect(html).toContain("Custom time · 02:45");
    expect(html).not.toContain("°C");
    expect(presetMatchesDuration(TEA_TIMER_PRESETS[0], 120)).toBe(true);
    expect(presetMatchesDuration(TEA_TIMER_PRESETS[0], 121)).toBe(false);
  });

  it("shows temperature only when the source preset actually provides it", () => {
    const presets: readonly TeaTimerPreset[] = [
      { id: "oolong", label: "Oolong", seconds: 180, temperatureC: 90 }
    ];
    const html = renderToStaticMarkup(createElement(TeaPresetRadioDial, {
      presets,
      selectedPresetId: "oolong",
      durationSeconds: 180,
      onSelect: () => undefined
    }));

    expect(html).toContain("Oolong · 03:00 · 90°C");
    expect(html).toContain("90 degrees Celsius, selected");
  });
});
