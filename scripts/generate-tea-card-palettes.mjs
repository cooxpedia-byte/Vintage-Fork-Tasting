import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error("Pass the supplied anji-tea-flip-card directory as the first argument.");

const outputDirectory = path.resolve("public/tea-cards");
const logoPath = path.resolve("public/brand/vintage-fork-icon.jpg");
const faces = ["front", "back"];
const themes = [
  { slug: "green", label: "Green", hue: 102, saturation: 0.38, lightness: lightness => lightness, panel: { hue: 142, saturation: 0.44, lightness: lightness => 0.055 + lightness * 0.83 } },
  { slug: "black", label: "Black", hue: 20, saturation: 0.12, lightness: lightness => Math.min(0.44, lightness * 0.78), panel: { hue: 24, saturation: 0.08, lightness: lightness => 0.045 + lightness * 0.7 } },
  { slug: "oolong", label: "Oolong", hue: 28, saturation: 0.52, lightness: lightness => lightness * 0.94, panel: { hue: 28, saturation: 0.52, lightness: lightness => 0.06 + lightness * 0.95 } },
  { slug: "white", label: "White", hue: 68, saturation: 0.12, lightness: lightness => Math.min(0.78, lightness * 1.08), panel: { hue: 72, saturation: 0.1, lightness: lightness => 0.16 + lightness * 0.82 } },
  { slug: "yellow", label: "Yellow", hue: 47, saturation: 0.58, lightness: lightness => Math.min(0.66, lightness * 1.02), panel: { hue: 45, saturation: 0.54, lightness: lightness => 0.08 + lightness * 0.95 } },
  { slug: "red", label: "Red", hue: 5, saturation: 0.54, lightness: lightness => lightness * 0.92, panel: { hue: 3, saturation: 0.55, lightness: lightness => 0.055 + lightness * 0.85 } },
  { slug: "dark", label: "Pu-erh / Dark", hue: 22, saturation: 0.34, lightness: lightness => Math.min(0.48, lightness * 0.82), panel: { hue: 20, saturation: 0.34, lightness: lightness => 0.045 + lightness * 0.72 } },
  { slug: "herbal", label: "Herbal", hue: 132, saturation: 0.36, lightness: lightness => lightness * 0.96, panel: { hue: 132, saturation: 0.42, lightness: lightness => 0.065 + lightness * 0.88 } }
];

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { hue, saturation, lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const pairs = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
  const [r1, g1, b1] = pairs[Math.floor(section) % 6];
  const match = lightness - chroma / 2;
  return [r1, g1, b1].map(channel => Math.round((channel + match) * 255));
}

function smoothstep(edge0, edge1, value) {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function goldPixelWeight(hue, saturation, lightness) {
  const hueWeight = smoothstep(23, 34, hue) * (1 - smoothstep(61, 72, hue));
  const saturationWeight = smoothstep(0.28, 0.55, saturation);
  const shadowProtection = smoothstep(0.24, 0.4, lightness);
  const highlightProtection = 1 - smoothstep(0.72, 0.9, lightness);
  return hueWeight * saturationWeight * shadowProtection * highlightProtection;
}

function goldPixelConfidence(hue, saturation, lightness) {
  return smoothstep(0.12, 0.5, goldPixelWeight(hue, saturation, lightness));
}

function recolourCardPalette(buffer, theme, info, face) {
  const result = Buffer.from(buffer);
  for (let offset = 0; offset < result.length; offset += 4) {
    if (result[offset + 3] === 0) continue;
    const { hue, saturation, lightness } = rgbToHsl(result[offset], result[offset + 1], result[offset + 2]);
    const pixelIndex = offset / 4;
    const x = pixelIndex % info.width;
    const y = Math.floor(pixelIndex / info.width);
    const insideFrontCrest = face === "front" && x >= 55 && x <= 886 && y >= 65 && y <= 650;
    const crestGoldProtection = insideFrontCrest
      ? smoothstep(0.008, 0.12, goldPixelWeight(hue, saturation, lightness))
      : 0;
    const goldProtection = Math.max(goldPixelConfidence(hue, saturation, lightness), crestGoldProtection);
    const hueEntry = smoothstep(54, 70, hue);
    const hueExit = 1 - smoothstep(115, 145, hue);
    const saturationWeight = smoothstep(0.055, 0.23, saturation);
    const highlightProtection = 1 - smoothstep(0.72, 0.9, lightness);
    const accentWeight = hueEntry * hueExit * saturationWeight * highlightProtection * (1 - goldProtection);
    const panelHueEntry = smoothstep(282, 302, hue);
    const panelHueExit = 1 - smoothstep(338, 354, hue);
    const panelSaturationWeight = smoothstep(0.08, 0.32, saturation);
    const panelShadowProtection = smoothstep(0.015, 0.075, lightness);
    const panelHighlightProtection = 1 - smoothstep(0.52, 0.76, lightness);
    const panelWeight = panelHueEntry * panelHueExit * panelSaturationWeight * panelShadowProtection * panelHighlightProtection * (1 - goldProtection);

    if (accentWeight > 0.01) {
      const targetLightness = Math.max(0.08, Math.min(0.88, theme.lightness(lightness)));
      const [targetRed, targetGreen, targetBlue] = hslToRgb(theme.hue, theme.saturation, targetLightness);
      result[offset] = Math.round(result[offset] * (1 - accentWeight) + targetRed * accentWeight);
      result[offset + 1] = Math.round(result[offset + 1] * (1 - accentWeight) + targetGreen * accentWeight);
      result[offset + 2] = Math.round(result[offset + 2] * (1 - accentWeight) + targetBlue * accentWeight);
    }

    if (panelWeight > 0.01) {
      const targetLightness = Math.max(0.06, Math.min(0.58, theme.panel.lightness(lightness)));
      const [targetRed, targetGreen, targetBlue] = hslToRgb(theme.panel.hue, theme.panel.saturation, targetLightness);
      result[offset] = Math.round(result[offset] * (1 - panelWeight) + targetRed * panelWeight);
      result[offset + 1] = Math.round(result[offset + 1] * (1 - panelWeight) + targetGreen * panelWeight);
      result[offset + 2] = Math.round(result[offset + 2] * (1 - panelWeight) + targetBlue * panelWeight);
    }
  }
  return result;
}

function goldDetailMask(buffer, info, face) {
  const result = Buffer.alloc(buffer.length);
  for (let offset = 0; offset < buffer.length; offset += 4) {
    const sourceAlpha = buffer[offset + 3];
    if (sourceAlpha === 0) continue;
    const { hue, saturation, lightness } = rgbToHsl(buffer[offset], buffer[offset + 1], buffer[offset + 2]);
    const pixelIndex = offset / 4;
    const x = pixelIndex % info.width;
    const y = Math.floor(pixelIndex / info.width);
    const confidence = goldPixelConfidence(hue, saturation, lightness);
    const insideFrontCrest = face === "front" && x >= 55 && x <= 886 && y >= 65 && y <= 650;
    const crestConfidence = insideFrontCrest
      ? smoothstep(0.008, 0.12, goldPixelWeight(hue, saturation, lightness))
      : 0;
    result[offset] = 255;
    result[offset + 1] = 255;
    result[offset + 2] = 255;
    result[offset + 3] = Math.round(sourceAlpha * Math.max(confidence, crestConfidence));
  }
  return result;
}

await mkdir(outputDirectory, { recursive: true });
const logoCrop = await sharp(logoPath)
  .extract({ left: 50, top: 62, width: 450, height: 450 })
  .png()
  .toBuffer();
const logoPlacements = {
  front: { size: 86, left: 428, top: 1400 },
  back: { size: 96, left: 423, top: 1401 }
};
const logoInserts = Object.fromEntries(await Promise.all(faces.map(async face => {
  const { size } = logoPlacements[face];
  const circleMask = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
  const insert = await sharp(logoCrop)
    .resize(size, size)
    .ensureAlpha()
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return [face, insert];
})));
const manifest = {};

for (const face of faces) {
  const sourcePath = path.join(sourceDirectory, "assets", `anji-white-tea-${face}.png`);
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await sharp(goldDetailMask(data, info, face), { raw: info })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDirectory, `anji-white-tea-${face}-gold-mask.png`));
}

for (const theme of themes) {
  manifest[theme.slug] = { label: theme.label };
  for (const face of faces) {
    const sourcePath = path.join(sourceDirectory, "assets", `anji-white-tea-${face}.png`);
    const outputName = `anji-white-tea-${face}-${theme.slug}.png`;
    const outputPath = path.join(outputDirectory, outputName);
    const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const output = recolourCardPalette(data, theme, info, face);
    const placement = logoPlacements[face];
    await sharp(output, { raw: info })
      .composite([{ input: logoInserts[face], left: placement.left, top: placement.top }])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath);
    manifest[theme.slug][face] = `/tea-cards/${outputName}`;
  }
}

await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${themes.length * faces.length} exact-layout card assets in ${outputDirectory}.`);
