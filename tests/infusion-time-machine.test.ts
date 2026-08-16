import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
    expect(html).toContain("Green");
    expect(html).toContain("Oolong");
    expect(html).toContain("Pu-erh");
    expect(html).toContain("Rooibos");
    expect(html).toContain("5:00");
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
});
