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

  it("clips the card effects to the supplied linework while keeping the detachable seal above them", () => {
    expect(css).toContain("anji-white-tea-front-gold-mask.png");
    expect(css).toContain("anji-white-tea-back-gold-mask.png");
    expect(css).toContain("@keyframes tasting-card-gold-lustre");
    expect(css).toContain("@keyframes tasting-card-seal-sweep");
    expect(css).toMatch(/\.tasting-card-face\.tasting-card-artwork-face::after\s*\{[^}]*z-index:\s*5;[^}]*inset:\s*2\.9% 3\.2% 4\.1%;/);
    expect(css).toContain(".tasting-card-flip.is-seal-coupled .tasting-card-artwork-face::after { opacity: .22; }");
    expect(css).toMatch(/\.tasting-card-flip\.is-seal-decoupled \.tasting-card-artwork-face::after\s*\{[^}]*opacity:\s*0;[^}]*animation-play-state:\s*paused;/);
    expect(css).toMatch(/\.tasting-card-detachable-seal\s*\{[^}]*z-index:\s*6;/);
    expect(css).toMatch(/\.tasting-card-secret-seal-target\s*\{[^}]*z-index:\s*7;/);
    expect(css).toContain(".tasting-card-detachable-seal.is-attached");
    expect(css).toContain(".tasting-card-detachable-seal.is-detached");
  });

  it("keeps the long front-title cover clear of the artwork label", () => {
    expect(css).toMatch(/\.tasting-card-live-front-name\.is-long\s*\{[^}]*top:\s*15\.2%;[^}]*height:\s*6\.5%;/);
    expect(css).toMatch(/\.tasting-card-live-front-name\.is-long\s*\{[^}]*box-shadow:\s*0 0 \.72cqw \.6cqw/);
    expect(css).toMatch(/\.tasting-card-live-front-name\.is-extra-long\s*\{[^}]*top:\s*14\.65%;[^}]*height:\s*7\.6%;/);
  });
});
