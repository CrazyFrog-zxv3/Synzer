import { performance } from 'node:perf_hooks';
import { WavetableOscillator, createHarmonicWavetableMipBank } from '../src/core/WavetableOscillator.js';

const sampleRate = 48000;
const blockSize = 128;
const voiceCount = 12;
const partials = Array.from({ length: 64 }, (_, index) => ({ harmonic: index + 1, amplitude: 1 / (index + 1) }));
const bank = createHarmonicWavetableMipBank({ size: 2048, partials });
const voices = Array.from({ length: voiceCount }, (_, index) => new WavetableOscillator({
  bank,
  sampleRate,
  frequency: 55 * (2 ** (index / 2)),
}));
const outputs = voices.map(() => new Float32Array(blockSize));
const warmupBlocks = 500;
const measuredBlocks = 5000;
const batchSize = 100;

function renderBlock() {
  for (let index = 0; index < voiceCount; index += 1) voices[index].render(outputs[index]);
}

for (let block = 0; block < warmupBlocks; block += 1) renderBlock();
const batchTimes = [];
for (let batch = 0; batch < measuredBlocks / batchSize; batch += 1) {
  const start = performance.now();
  for (let block = 0; block < batchSize; block += 1) renderBlock();
  batchTimes.push((performance.now() - start) / batchSize);
}
batchTimes.sort((a, b) => a - b);
const meanMsPerBlock = batchTimes.reduce((sum, value) => sum + value, 0) / batchTimes.length;
const p95MsPerBlock = batchTimes[Math.floor((batchTimes.length - 1) * 0.95)];
const budgetMs = (blockSize / sampleRate) * 1000;
const checksum = outputs.reduce((sum, output) => sum + output.reduce((partial, value) => partial + Math.abs(value), 0), 0);
console.log('SYNZER Wavetable mip oscillator benchmark');
console.log(JSON.stringify({
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  sampleRate,
  blockSize,
  voices: voiceCount,
  tableSize: bank.tableSize,
  mipLevels: bank.levels.map((level) => level.maxHarmonic),
  measuredBlocks,
  meanMsPerBlock,
  p95MsPerBlock,
  realtimeBudgetMs: budgetMs,
  meanBudgetPercent: (meanMsPerBlock / budgetMs) * 100,
  p95BudgetPercent: (p95MsPerBlock / budgetMs) * 100,
  checksum,
  note: 'Desktop x64 informational benchmark; not an Android/ARM64 performance claim.',
}, null, 2));
