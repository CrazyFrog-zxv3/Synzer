import { performance } from 'node:perf_hooks';
import { VoiceEngine } from '../src/core/VoiceEngine.js';

const sampleRate = 48000;
const blockSize = 128;
const voiceCount = 12;
const warmupBlocks = 500;
const measuredBlocks = 10000;
const batchSize = 25;

const engine = new VoiceEngine({
  sampleRate,
  maxVoices: voiceCount,
  maxStealTails: 4,
  voiceGain: 0.075,
});

engine.setParameters({
  'engine.virtual-analog.filter-mode': 'lowpass',
  'engine.virtual-analog.filter-cutoff': 2400,
  'engine.virtual-analog.filter-resonance': 4,
});

for (let index = 0; index < voiceCount; index++) {
  engine.noteOn({
    id: 'bench-' + index,
    note: 48 + index,
    frequency: 110 * (2 ** (index / 12)),
    velocity: 0.75,
    waveform: ['saw', 'square', 'sine'][index % 3],
    envelope: { attack: 0, decay: 0, sustain: 1, release: 0.2 },
  });
}

const left = new Float32Array(blockSize);
const right = new Float32Array(blockSize);
for (let index = 0; index < warmupBlocks; index++) engine.render(left, right);

const batchDurations = [];
let started = performance.now();
for (let block = 0; block < measuredBlocks; block++) {
  engine.render(left, right);
  if ((block + 1) % batchSize === 0) {
    const now = performance.now();
    batchDurations.push((now - started) / batchSize);
    started = now;
  }
}

batchDurations.sort((a, b) => a - b);
const mean = batchDurations.reduce((sum, value) => sum + value, 0) / batchDurations.length;
const p95 = batchDurations[Math.floor((batchDurations.length - 1) * 0.95)];
const realTimeBudgetMs = (blockSize / sampleRate) * 1000;

console.log('SYNZER DSP informational render benchmark');
console.log(JSON.stringify({
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  sampleRate,
  blockSize,
  voices: voiceCount,
  waveforms: 'saw/square/sine mixed',
  filter: 'TPT lowpass, 2.4 kHz, Q 4, per voice',
  measuredBlocks,
  meanMsPerBlock: Number(mean.toFixed(5)),
  p95BatchMsPerBlock: Number(p95.toFixed(5)),
  realtimeBudgetMs: Number(realTimeBudgetMs.toFixed(5)),
  meanBudgetPercent: Number((mean / realTimeBudgetMs * 100).toFixed(2)),
  p95BudgetPercent: Number((p95 / realTimeBudgetMs * 100).toFixed(2)),
  note: 'Desktop CI runner only; informational, not an Android performance claim.',
}, null, 2));
