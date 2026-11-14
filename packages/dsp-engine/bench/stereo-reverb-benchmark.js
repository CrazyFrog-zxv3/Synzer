import { performance } from 'node:perf_hooks';
import { StereoReverb } from '../src/core/StereoReverb.js';

const sampleRate = 48000;
const blockSize = 128;
const iterations = 20000;
const reverb = new StereoReverb({ sampleRate, roomSize: 0.82, damping: 0.4, mix: 0.35, width: 0.9, modulationRateHz: 0.7, modulationDepthMs: 1.2 });
const left = new Float32Array(blockSize);
const right = new Float32Array(blockSize);
for (let i = 0; i < blockSize; i += 1) left[i] = right[i] = Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 0.2;
const dryLeft = left.slice();
const dryRight = right.slice();
for (let i = 0; i < 2000; i += 1) { left.set(dryLeft); right.set(dryRight); reverb.process(left, right); }
const timings = new Float64Array(iterations);
for (let i = 0; i < iterations; i += 1) {
  left.set(dryLeft);
  right.set(dryRight);
  const start = performance.now();
  reverb.process(left, right);
  timings[i] = performance.now() - start;
}
timings.sort();
const mean = timings.reduce((sum, value) => sum + value, 0) / iterations;
console.log(JSON.stringify({ sampleRate, blockSize, iterations, meanMsPerBlock: Number(mean.toFixed(5)), p95MsPerBlock: Number(timings[Math.floor(iterations * 0.95)].toFixed(5)), budgetMsPerBlock: Number(((blockSize / sampleRate) * 1000).toFixed(5)), finiteOutput: [...left, ...right].every(Number.isFinite) }, null, 2));
