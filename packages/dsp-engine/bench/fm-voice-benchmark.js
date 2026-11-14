import { performance } from 'node:perf_hooks';
import { FMVoiceEngine } from '../src/core/FMVoiceEngine.js';

const sampleRate = 48000;
const blockFrames = 128;
const voiceCount = 12;
const warmupBlocks = 2000;
const measuredBlocks = 10000;
const engine = new FMVoiceEngine({ sampleRate, maxVoices: voiceCount });
for (let index = 0; index < voiceCount; index++) {
  const note = 48 + index;
  engine.noteOn({ id: `benchmark-${index}`, note, frequency: 440 * (2 ** ((note - 69) / 12)), velocity: 0.8 });
}
const left = new Float32Array(blockFrames);
const right = new Float32Array(blockFrames);
for (let index = 0; index < warmupBlocks; index++) engine.render(left, right);
const timings = new Array(measuredBlocks);
for (let index = 0; index < measuredBlocks; index++) {
  const start = performance.now();
  engine.render(left, right);
  timings[index] = performance.now() - start;
}
timings.sort((a, b) => a - b);
const meanMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
const p95Ms = timings[Math.floor(timings.length * 0.95)];
const blockBudgetMs = blockFrames / sampleRate * 1000;
process.stdout.write(`${JSON.stringify({
  engine: 'FM / Phase Modulation · four operators', voiceCount, sampleRate, blockFrames,
  warmupBlocks, measuredBlocks, meanMs: +meanMs.toFixed(5), p95Ms: +p95Ms.toFixed(5),
  blockBudgetMs: +blockBudgetMs.toFixed(5), p95BudgetUsePercent: +(p95Ms / blockBudgetMs * 100).toFixed(2),
  outputFinite: [...left, ...right].every(Number.isFinite),
}, null, 2)}\n`);
