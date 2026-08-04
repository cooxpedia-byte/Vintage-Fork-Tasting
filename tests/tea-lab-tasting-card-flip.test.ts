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

  it("clips a single-layer 24K-style lustre to the supplied card linework and seal", () => {
    expect(css).toContain("anji-white-tea-front-gold-mask.png");
    expect(css).toContain("anji-white-tea-back-gold-mask.png");
    expect(css).toContain("@keyframes tasting-card-gold-lustre");
    expect(css).toContain("@keyframes tasting-card-seal-sweep");
    expect(css).toContain(".tasting-card-face.tasting-card-artwork-face::after { content: none; display: none; }");
    expect(css).toMatch(/\.tasting-card-detachable-seal\s*\{[^}]*position:\s*absolute/);
    expect(css).toContain(".tasting-card-detachable-seal.is-attached");
    expect(css).toContain(".tasting-card-detachable-seal.is-detached");
  });
});
