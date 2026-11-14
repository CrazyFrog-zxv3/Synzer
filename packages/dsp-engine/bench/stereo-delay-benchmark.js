import { performance } from 'node:perf_hooks';
import { StereoDelay } from '../src/core/StereoDelay.js';

const sampleRate = 48000;
const blockSize = 128;
const blocks = 12000;
const delay = new StereoDelay({ sampleRate, time: 0.375, feedback: 0.82, mix: 0.55, pingPong: true });
const left = new Float32Array(blockSize);
const right = new Float32Array(blockSize);
let seed = 0x51a7;
for (let index = 0; index < blockSize; index += 1) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  left[index] = ((seed / 0x100000000) * 2 - 1) * 0.1;
  right[index] = ((seed / 0x100000000) * 2 - 1) * 0.1;
}
for (let index = 0; index < 1000; index += 1) delay.process(left, right);
const durations = [];
for (let batch = 0; batch < 120; batch += 1) {
  const start = performance.now();
  for (let index = 0; index < 100; index += 1) delay.process(left, right);
  durations.push(performance.now() - start);
}
durations.sort((a, b) => a - b);
const meanMsPerBlock = durations.reduce((sum, value) => sum + value, 0) / durations.length / 100;
const p95MsPerBlock = durations[Math.floor(durations.length * 0.95)] / 100;
const budgetMs = (blockSize / sampleRate) * 1000;
console.log(JSON.stringify({
  runtime: process.version, platform: process.platform, architecture: process.arch,
  sampleRate, blockSize, measuredBlocks: blocks, meanMsPerBlock,
  p95MsPerBlock, realtimeBudgetMs: budgetMs,
  meanBudgetPercent: Number((meanMsPerBlock / budgetMs * 100).toFixed(2)),
  p95BudgetPercent: Number((p95MsPerBlock / budgetMs * 100).toFixed(2)),
  configuration: 'stereo ping-pong, 375 ms, 82% feedback, 55% wet',
  note: 'Desktop CI runner only; informational, not an Android performance claim.'
}, null, 2));
