import { performance } from 'node:perf_hooks';
import { EffectRack } from '../src/core/EffectRack.js';
import { StereoDelay } from '../src/core/StereoDelay.js';
import { StereoReverb } from '../src/core/StereoReverb.js';

const sampleRate = 48000;
const blockSize = 128;
const iterations = 20000;
const rack = new EffectRack({
  delay: new StereoDelay({ sampleRate, time: 0.375, feedback: 0.35, mix: 0 }),
  reverb: new StereoReverb({ sampleRate, roomSize: 0.72, damping: 0.35, mix: 0, modulationDepthMs: 0.8 }),
});
rack.setConfiguration({ mode: 'parallel', levels: { delay: { send: 0.8, return: 0.65 }, reverb: { send: 0.75, return: 0.8 } }, dryLevel: 0.85, wetLevel: 0.8 });
const left = new Float32Array(blockSize);
const right = new Float32Array(blockSize);
for (let warmup = 0; warmup < 2000; warmup += 1) {
  left.fill(0.05); right.fill(-0.035); rack.process(left, right);
}
const samples = new Array(iterations);
for (let run = 0; run < iterations; run += 1) {
  left.fill(0.05); right.fill(-0.035);
  const start = performance.now();
  rack.process(left, right);
  samples[run] = performance.now() - start;
}
samples.sort((a, b) => a - b);
const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const p95 = samples[Math.floor(samples.length * 0.95)];
const budgetMs = (blockSize / sampleRate) * 1000;
console.log(JSON.stringify({ environment: `Node ${process.version} / ${process.platform} ${process.arch}`, sampleRate, blockSize, iterations, mode: 'parallel', meanMsPerBlock: Number(mean.toFixed(5)), p95MsPerBlock: Number(p95.toFixed(5)), blockBudgetMs: Number(budgetMs.toFixed(5)), p95BudgetPercent: Number(((p95 / budgetMs) * 100).toFixed(2)), finiteOutput: [...left, ...right].every(Number.isFinite) }, null, 2));
