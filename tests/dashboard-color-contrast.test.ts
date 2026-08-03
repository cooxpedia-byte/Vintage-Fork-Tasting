import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Rgb = [number, number, number];

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

function cssHexVariable(name: string): Rgb {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`Missing CSS color variable --${name}`);
  return [1, 3, 5].map(index => Number.parseInt(match[1].slice(index, index + 2), 16)) as Rgb;
}

function blend(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map((channel, index) => channel * alpha + background[index] * (1 - alpha)) as Rgb;
}

function luminance(color: Rgb): number {
  const [red, green, blue] = color.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("dashboard muted text contrast", () => {
  const muted = cssHexVariable("vf-fog");
  const ivory = cssHexVariable("vf-ivory");
  const parchment = cssHexVariable("vf-parchment");
  const gold = cssHexVariable("vf-gold");

  it("meets WCAG AA on cards and the page background", () => {
    const card = blend(ivory, parchment, 0.96);

    expect(contrastRatio(muted, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, parchment)).toBeGreaterThanOrEqual(4.5);
  });

  it("meets WCAG AA inside dashboard notices", () => {
    const notice = blend(gold, ivory, 0.09);

    expect(contrastRatio(muted, notice)).toBeGreaterThanOrEqual(4.5);
  });
});
