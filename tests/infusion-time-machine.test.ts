import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
  });
});
