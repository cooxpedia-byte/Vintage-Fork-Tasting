import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sampleRate = 44_100;
const outputRoot = resolve(process.argv[2] ?? "public/audio/vintage-timer");

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0xffff_ffff * 2 - 1;
  };
}

function envelope(time, attack, decay) {
  return Math.min(1, time / attack) * Math.exp(-time / decay);
}

function impulse(time, start, attack, decay) {
  if (time < start) return 0;
  return envelope(time - start, attack, decay);
}

function detent(seed, bodyHz, metalHz) {
  const random = randomSource(seed);
  let noiseBody = 0;
  return synthesize(0.055, (time) => {
    const rawNoise = random();
    noiseBody = noiseBody * 0.58 + rawNoise * 0.42;
    const contact = (rawNoise - noiseBody) * envelope(time, 0.0008, 0.012);
    const body = Math.sin(2 * Math.PI * bodyHz * time) * envelope(time, 0.0012, 0.022);
    const metal = Math.sin(2 * Math.PI * metalHz * time + 0.2) * envelope(time, 0.0006, 0.009);
    return contact * 0.38 + body * 0.28 + metal * 0.13;
  });
}

function warmImpact(seed, duration, bodyHz, metalHz, secondaryAt = null) {
  const random = randomSource(seed);
  let filtered = 0;
  return synthesize(duration, (time) => {
    const first = impulse(time, 0, 0.0015, 0.038);
    const second = secondaryAt === null ? 0 : impulse(time, secondaryAt, 0.001, 0.03);
    const energy = first + second * 0.62;
    const noise = random();
    filtered = filtered * 0.76 + noise * 0.24;
    const body = Math.sin(2 * Math.PI * bodyHz * time) * energy;
    const shell = Math.sin(2 * Math.PI * metalHz * time + 0.35) * energy;
    return body * 0.38 + shell * 0.17 + filtered * energy * 0.22;
  });
}

function brassChime(seed, duration, fundamental, strikeAt = 0) {
  const random = randomSource(seed);
  return synthesize(duration, (time) => {
    if (time < strikeAt) return 0;
    const localTime = time - strikeAt;
    const attack = Math.min(1, localTime / 0.004);
    const strike = random() * envelope(localTime, 0.0008, 0.018) * 0.07;
    const partials = [
      [1, 0.52, 0.72],
      [2.01, 0.23, 0.43],
      [2.67, 0.13, 0.31],
      [4.06, 0.07, 0.19]
    ];
    const tone = partials.reduce((sum, [ratio, gain, decay]) => (
      sum + Math.sin(2 * Math.PI * fundamental * ratio * localTime) * gain * Math.exp(-localTime / decay)
    ), 0);
    return tone * attack + strike;
  });
}

function synthesize(durationSeconds, sampleAt) {
  const samples = new Float64Array(Math.ceil(durationSeconds * sampleRate));
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = sampleAt(index / sampleRate);
    samples[index] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const scale = peak > 0 ? 0.78 / peak : 1;
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    pcm[index] = Math.round(Math.max(-1, Math.min(1, samples[index] * scale)) * 32_767);
  }
  return wavFile(pcm);
}

function wavFile(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

const sounds = new Map([
  ["wheel-detent-a.wav", detent(0x5646_1001, 620, 2_480)],
  ["wheel-detent-b.wav", detent(0x5646_1002, 655, 2_360)],
  ["wheel-detent-c.wav", detent(0x5646_1003, 590, 2_610)],
  ["wheel-detent-d.wav", detent(0x5646_1004, 685, 2_290)],
  ["wheel-settle.wav", warmImpact(0x5646_2001, 0.105, 430, 1_640, 0.032)],
  ["button-down.wav", warmImpact(0x5646_3001, 0.07, 520, 1_920)],
  ["button-release.wav", warmImpact(0x5646_3002, 0.085, 460, 1_520, 0.026)],
  ["start-mechanical.wav", warmImpact(0x5646_4001, 0.19, 245, 980, 0.058)],
  ["start-relay.wav", warmImpact(0x5646_4002, 0.09, 710, 2_140)],
  ["timer-complete-primary.wav", brassChime(0x5646_5001, 0.95, 698.46)],
  ["timer-complete-secondary.wav", brassChime(0x5646_5002, 0.82, 523.25)]
]);

await mkdir(outputRoot, { recursive: true });
await Promise.all([...sounds].map(([filename, contents]) => writeFile(resolve(outputRoot, filename), contents)));
console.log(`Generated ${sounds.size} original Vintage Fork timer sounds in ${outputRoot}`);
