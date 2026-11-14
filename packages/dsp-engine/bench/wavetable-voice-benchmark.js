import { performance } from 'node:perf_hooks';
import { VoiceEngine } from '../src/core/VoiceEngine.js';

const sampleRate = 48000;
const blockSize = 128;
const voiceCount = 12;
const iterations = 1200;
const warmup = 200;
const partials = Array.from({ length: 64 }, (_, index) => ({
  harmonic: index + 1,
  amplitude: 1 / (index + 1),
}));
const engine = new VoiceEngine({ sampleRate, maxVoices: voiceCount, voiceGain: 0.075 });
for (let index = 0; index < voiceCount; index += 1) {
  engine.noteOn({
    id: `wavetable-${index}`,
    note: 36 + index * 4,
    frequency: 65.406 * (2 ** ((index * 4) / 12)),
    velocity: 0.8,
    envelope: { attack: 0, decay: 0, sustain: 1, release: 0.01 },
    wavetable: { size: 2048, partials },
  });
}
const left = new Float32Array(blockSize);
const right = new Float32Array(blockSize);
for (let index = 0; index < warmup; index += 1) engine.render(left, right);
const durations = [];
for (let index = 0; index < iterations; index += 1) {
  const start = performance.now();
  engine.render(left, right);
  durations.push(performance.now() - start);
}
durations.sort((a, b) => a - b);
const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
const p95 = durations[Math.floor(durations.length * 0.95)];
const budget = (blockSize / sampleRate) * 1000;
console.log(JSON.stringify({
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  sampleRate,
  blockSize,
  voiceCount,
  tableSize: 2048,
  partialCount: partials.length,
  iterations,
  meanMsPerBlock: Number(mean.toFixed(5)),
  p95MsPerBlock: Number(p95.toFixed(5)),
  blockBudgetMs: Number(budget.toFixed(5)),
  meanBudgetPercent: Number(((mean / budget) * 100).toFixed(2)),
  p95BudgetPercent: Number(((p95 / budget) * 100).toFixed(2)),
}, null, 2));
