import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const assetDirectory = path.resolve("public/tea-cards");
const themes = ["green", "black", "oolong", "white", "yellow", "red", "dark", "herbal"];

function pngDimensions(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString()).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("supplied tasting-card colour assets", () => {
  it("provides exact-size front and back artwork for every tea family", () => {
    for (const face of ["front", "back"]) {
      const hashes = themes.map(theme => {
        const buffer = readFileSync(path.join(assetDirectory, `anji-white-tea-${face}-${theme}.png`));
        expect(pngDimensions(buffer)).toEqual({ width: 941, height: 1672 });
        return createHash("sha256").update(buffer).digest("hex");
      });
      expect(new Set(hashes).size).toBe(themes.length);
    }
  });

  it("publishes a manifest for all generated colourways", () => {
    const manifest = JSON.parse(readFileSync(path.join(assetDirectory, "manifest.json"), "utf8"));
    expect(Object.keys(manifest)).toEqual(themes);
    for (const theme of themes) {
      expect(manifest[theme].front).toBe(`/tea-cards/anji-white-tea-front-${theme}.png`);
      expect(manifest[theme].back).toBe(`/tea-cards/anji-white-tea-back-${theme}.png`);
    }
  });

  it("provides exact-size alpha masks for gold-plated line highlights", async () => {
    for (const face of ["front", "back"]) {
      const maskPath = path.join(assetDirectory, `anji-white-tea-${face}-gold-mask.png`);
      const buffer = readFileSync(maskPath);
      expect(pngDimensions(buffer)).toEqual({ width: 941, height: 1672 });
      const stats = await sharp(buffer).stats();
      expect(stats.isOpaque).toBe(false);
    }
  });

  it("provides the detachable ornate seal as transparent artwork", async () => {
    const sealPath = path.join(assetDirectory, "detachable-seal-coin.png");
    const buffer = readFileSync(sealPath);
    expect(pngDimensions(buffer)).toEqual({ width: 1254, height: 1254 });
    const metadata = await sharp(buffer).metadata();
    const stats = await sharp(buffer).stats();
    expect(metadata.hasAlpha).toBe(true);
    expect(stats.isOpaque).toBe(false);
  });

  it("uses the same official website logo in every lower medallion", async () => {
    const placements = {
      front: { left: 428, top: 1400, width: 86, height: 86 },
      back: { left: 423, top: 1401, width: 96, height: 96 }
    };
    for (const face of ["front", "back"] as const) {
      const hashes = await Promise.all(themes.map(async theme => {
        const placement = placements[face];
        const inset = 18;
        const medallion = await sharp(path.join(assetDirectory, `anji-white-tea-${face}-${theme}.png`))
          .extract({
            left: placement.left + inset,
            top: placement.top + inset,
            width: placement.width - inset * 2,
            height: placement.height - inset * 2
          })
          .raw()
          .toBuffer();
        return createHash("sha256").update(medallion).digest("hex");
      }));
      expect(new Set(hashes).size).toBe(1);
    }
  });

  it("keeps protected 24K gold pixels identical across every tea palette", async () => {
    for (const face of ["front", "back"]) {
      const mask = await sharp(path.join(assetDirectory, `anji-white-tea-${face}-gold-mask.png`))
        .ensureAlpha()
        .raw()
        .toBuffer();
      const hashes = await Promise.all(themes.map(async theme => {
        const artwork = await sharp(path.join(assetDirectory, `anji-white-tea-${face}-${theme}.png`))
          .ensureAlpha()
          .raw()
          .toBuffer();
        const hash = createHash("sha256");
        for (let offset = 0; offset < artwork.length; offset += 4) {
          if (mask[offset + 3] < 254) continue;
          hash.update(artwork.subarray(offset, offset + 4));
        }
        return hash.digest("hex");
      }));
      expect(new Set(hashes).size).toBe(1);
    }
  });
});
