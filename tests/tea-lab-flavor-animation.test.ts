import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8")
  .replace(/\s+/g, " ");

describe("Tea Lab flavour palette animation", () => {
  it("floats selected flavours with staggered timing and reduced-motion protection", () => {
    expect(css).toContain(".flavor-palette-chip {");
    expect(css).toContain("animation: flavor-palette-float 3.6s ease-in-out infinite");
    expect(css).toContain(".flavor-palette-chip:nth-child(2n)");
    expect(css).toContain("@keyframes flavor-palette-float");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
