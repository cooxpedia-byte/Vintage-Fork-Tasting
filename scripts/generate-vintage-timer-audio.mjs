import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const expectedSourceSha256 = "f768c4b0b1cb5c96792c287112628bbe3e7b7bfdcd0afa8704129d064bee1bef";
const sourcePath = process.argv[2] ? resolve(process.argv[2]) : null;
const outputRoot = resolve(process.argv[3] ?? "public/audio/vintage-timer");

if (!sourcePath) {
  console.error("Usage: node scripts/generate-vintage-timer-audio.mjs <licensed-source.mov> [output-directory]");
  process.exit(2);
}

const sourceHash = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
if (sourceHash !== expectedSourceSha256) {
  console.error(`Refusing unexpected source audio: SHA-256 ${sourceHash}`);
  process.exit(2);
}

const clips = [
  { filename: "wheel-detent-a.wav", start: .380, duration: .060, fadeOut: .012, gain: .78 },
  { filename: "wheel-detent-b.wav", start: .380, duration: .060, fadeOut: .012, gain: .78 },
  { filename: "wheel-detent-c.wav", start: .380, duration: .060, fadeOut: .012, gain: .78 },
  { filename: "wheel-detent-d.wav", start: .380, duration: .060, fadeOut: .012, gain: .78 },
  { filename: "wheel-settle.wav", start: 7.210, duration: .380, fadeOut: .045, gain: .78 },
  { filename: "button-down.wav", start: 8.655, duration: .120, fadeOut: .025, gain: .8 },
  { filename: "button-release.wav", start: 8.858, duration: .115, fadeOut: .025, gain: .8 },
  { filename: "start-mechanical.wav", start: .145, duration: .830, fadeOut: .060, gain: .72 },
  { filename: "start-relay.wav", start: 9.318, duration: .115, fadeOut: .025, gain: .8 },
  { filename: "timer-complete-primary.wav", start: 10.820, duration: .720, fadeOut: .055, gain: .72 },
  { filename: "timer-complete-secondary.wav", start: 11.650, duration: .680, fadeOut: .070, gain: .72 }
];

await mkdir(outputRoot, { recursive: true });
for (const clip of clips) {
  const fadeOutStart = Math.max(.01, clip.duration - clip.fadeOut);
  const filter = [
    "highpass=f=120",
    "lowpass=f=15500",
    `volume=${clip.gain}`,
    "afade=t=in:st=0:d=0.004",
    `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${clip.fadeOut}`,
    "alimiter=limit=.92"
  ].join(",");
  const result = spawnSync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(clip.start),
    "-i", sourcePath,
    "-t", String(clip.duration),
    "-vn",
    "-af", filter,
    "-ar", "44100",
    "-ac", "2",
    "-c:a", "pcm_s16le",
    resolve(outputRoot, clip.filename)
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Prepared ${clips.length} licensed Vintage Fork timer sounds in ${outputRoot}`);
