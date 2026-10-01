import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

describe("Tea Lab tasting-card flip presentation", () => {
  it("uses a three-dimensional animated flip with a reduced-motion fallback", () => {
    expect(css).toMatch(/\.tasting-card-flip\s*\{[^}]*transform-style:\s*preserve-3d/);
    expect(css).toMatch(/\.tasting-card-flip\s*\{[^}]*transition:\s*transform\s+760ms/);
    expect(css).toContain(".tasting-card-flip.is-flipped { transform: rotateY(180deg); }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("preserves the card artwork while keeping personal records free of tier effects", () => {
    expect(css).toContain("anji-white-tea-front-gold-mask.png");
    expect(css).toContain("anji-white-tea-back-gold-mask.png");
    expect(css).toContain("@keyframes tasting-card-gold-lustre");
    expect(css).toMatch(/\.tasting-card-face\.tasting-card-artwork-face::after\s*\{[^}]*z-index:\s*5;[^}]*inset:\s*2\.9% 3\.2% 4\.1%;/);
    expect(css).toMatch(/\.tasting-card-personal-record \.tasting-card-artwork-face::after\s*\{[^}]*opacity:\s*0;[^}]*animation:\s*none;/);
  });

  it("keeps the long front-title cover clear of the artwork label", () => {
    expect(css).toMatch(/\.tasting-card-live-front-name\.is-long\s*\{[^}]*top:\s*15\.2%;[^}]*height:\s*6\.5%;/);
    expect(css).toMatch(/\.tasting-card-live-front-name\.is-long\s*\{[^}]*box-shadow:\s*0 0 \.72cqw \.6cqw/);
    expect(css).toMatch(/\.tasting-card-live-front-name\.is-extra-long\s*\{[^}]*top:\s*14\.65%;[^}]*height:\s*7\.6%;/);
  });
});
