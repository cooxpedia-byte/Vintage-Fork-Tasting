import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import InfusionTimeMachinePage from "@/app/infusion-time-machine/page";
import { InfusionTimeMachineApp } from "@/components/tea-lab/InfusionTimeMachineApp";

describe("standalone Infusion Time Machine", () => {
  it("renders the exact shared Tea Lab mechanism with a two-minute default", () => {
    const html = renderToStaticMarkup(createElement(InfusionTimeMachineApp));

    expect(html).toContain("Vintage Fork Infusion Time Machine");
    expect(html).toContain('class="field tea-lab-slider-field tea-lab-duration-field"');
    expect(html).toContain('id="infusion-time-machine-hours"');
    expect(html).toContain('id="infusion-time-machine-minutes"');
    expect(html).toContain('id="infusion-time-machine-seconds"');
    expect(html).toContain('aria-label="2 min"');
    expect(html).toContain('data-timer-machine="true"');
    expect(html).toContain('data-timer-status="ready"');
    expect(html).toContain('class="machine-clock"');
    expect(html).toContain('class="machine-odometer-digit"');
    expect(html).toContain('class="machine-split-flap"');
    expect(html).toContain('class="machine-split-flap-seam"');
    expect(html).toContain('role="timer"');
    expect(html).toContain("Precision Tea Timer");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Timer status: Ready"');
    expect(html).toContain('aria-label="Reset infusion timer to zero"');
    expect(html).toContain('aria-live="assertive"');
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
    expect(html).toContain("Tea programs");
    expect(html).toContain("Green");
    expect(html).toContain("Oolong");
    expect(html).toContain("Pu-erh");
    expect(html).toContain("Rooibos");
    expect(html).toContain("5:00");
    expect(html).toContain('aria-label="Green tea preset, 2:00"');
    expect(html).toContain('aria-label="White tea preset, 4:00"');
    expect(html).toContain('aria-label="Oolong tea preset, 3:00"');
    expect(html).toContain('aria-label="Black tea preset, 4:00"');
    expect(html).toContain('aria-label="Pu-erh tea preset, 3:00"');
    expect(html).toContain('aria-label="Herbal tea preset, 5:00"');
    expect(html).toContain('aria-label="Rooibos tea preset, 5:00"');
    expect(html).toContain("Mechanical sound on");
  });

  it("preloads the mechanical detent before the rest of the sound library", () => {
    const html = renderToStaticMarkup(createElement(InfusionTimeMachinePage));

    expect(html).toContain('rel="preload"');
    expect(html).toContain('href="/audio/vintage-timer/wheel-detent-a.wav"');
    expect(html).toContain('as="fetch"');
    expect(html).toContain('href="/brand/loading-wallpaper.jpg"');
    expect(html).toContain('as="image"');
  });

  it("uses a scoped material token system and a deliberate mobile preset rail", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const redesign = css.slice(css.indexOf("Infusion Time Machine v2"));

    expect(redesign).toContain("--machine-background");
    expect(redesign).toContain("--iron-deep");
    expect(redesign).toContain("--brass-main");
    expect(redesign).toContain("--aged-copper");
    expect(redesign).toContain("--warm-ivory");
    expect(redesign).toContain("--amber-lamp");
    expect(redesign).toContain("--brand-purple: #662461");
    expect(redesign).toMatch(/\.infusion-time-machine-presets\s*\{[^}]*position:\s*relative/);
    expect(redesign).toMatch(/\.infusion-time-machine-preset-bank\s*\{[^}]*grid-auto-flow:\s*column/);
    expect(redesign).toContain("overscroll-behavior-x: contain");
    expect(redesign).toContain("scroll-snap-type: x proximity");
  });

  it("animates only changing split-flap digits and disables mechanical motion when requested", () => {
    const source = readFileSync("src/components/tea-lab/TeaLabBrewSliders.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");
    const redesign = css.slice(css.indexOf("Infusion Time Machine v2"));

    expect(source).toContain('data-changing={transition.previous === transition.current ? "false" : "true"}');
    expect(source).toContain('key={`${group.unit}-${digitIndex}`}');
    expect(source).toContain('className="machine-split-flap-face machine-split-flap-flip-out"');
    expect(source).toContain('className="machine-split-flap-face machine-split-flap-flip-in"');
    expect(redesign).toContain("machine-split-flap-out 240ms");
    expect(redesign).toContain("machine-split-flap-in 240ms");
    expect(redesign).toMatch(/\.machine-split-flap-face\s*>\s*span\s*\{[^}]*transform:\s*translateY\(-\.05em\)/);
    expect(redesign).toContain("@media (prefers-reduced-motion: reduce)");
    expect(redesign).toMatch(/prefers-reduced-motion:[\s\S]*machine-split-flap-flip-out[\s\S]*display:\s*none/);
  });

  it("keeps the real logo and existing timer, feedback, and deadline architecture", () => {
    const sliderSource = readFileSync("src/components/tea-lab/TeaLabBrewSliders.tsx", "utf8");
    const appSource = readFileSync("src/components/tea-lab/InfusionTimeMachineApp.tsx", "utf8");

    expect(sliderSource).toContain('src="/brand/vintage-fork-icon.jpg"');
    expect(sliderSource).toContain("deadline.current = Date.now() + duration * 1000");
    expect(sliderSource).toContain('playVintageTimerEvent("wheelSettle", "wheelSettle")');
    expect(sliderSource).toContain('playVintageTimerEvent("timerCompletePrimary", "timerComplete")');
    expect(appSource).toContain('playVintageTimerEvent("buttonDown", "selectionDetent")');
    expect(appSource).toContain("const OPENING_FILM_DURATION_MS = 8_000");
  });
});
