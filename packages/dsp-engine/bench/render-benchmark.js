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
  'engine.virtual-analog.osc2-enabled': true,
  'engine.virtual-analog.osc2-wave': 'square',
  'engine.virtual-analog.osc2-level': 0.5,
  'engine.virtual-analog.osc2-octave': -1,
  'engine.virtual-analog.noise-enabled': true,
  'engine.virtual-analog.noise-color': 'pink',
  'engine.virtual-analog.noise-level': 0.2,
  'engine.virtual-analog.sub-enabled': true,
  'engine.virtual-analog.sub-wave': 'square',
  'engine.virtual-analog.sub-level': 0.2,
  'engine.virtual-analog.sub-octave': -1,
  'engine.virtual-analog.unison-voices': 4,
  'engine.virtual-analog.unison-detune': 12,
  'engine.virtual-analog.unison-spread': 70,
  'engine.virtual-analog.filter-mode': 'lowpass',
  'engine.virtual-analog.filter-cutoff': 2400,
  'engine.virtual-analog.filter-resonance': 4,
  'engine.virtual-analog.filter-env-attack': 30,
  'engine.virtual-analog.filter-env-decay': 30,
  'engine.virtual-analog.filter-env-sustain': 1,
  'engine.virtual-analog.filter-env-amount': 24,
  'engine.virtual-analog.pitch-env-attack': 30,
  'engine.virtual-analog.pitch-env-decay': 30,
  'engine.virtual-analog.pitch-env-sustain': 1,
  'engine.virtual-analog.pitch-env-osc1-amount': 12,
  'engine.virtual-analog.pitch-env-osc2-amount': -8,
  'engine.virtual-analog.lfo1-rate': 5,
  'engine.virtual-analog.lfo1-waveform': 'sine',
  'engine.virtual-analog.lfo1-amount': 12,
  'engine.virtual-analog.eg-osc1-pitch-amount': 7,
  'engine.virtual-analog.eg-osc1-pitch-enabled': true,
  'engine.virtual-analog.lfo-osc2-pitch-amount': -5,
  'engine.virtual-analog.lfo-osc2-pitch-enabled': true,
  'engine.virtual-analog.eg-sub-pitch-amount': 6,
  'engine.virtual-analog.eg-sub-pitch-enabled': true,
  'engine.virtual-analog.pitch-env-sub-pitch-amount': -8,
  'engine.virtual-analog.pitch-env-sub-pitch-enabled': true,
  'engine.virtual-analog.lfo-sub-pitch-amount': 5,
  'engine.virtual-analog.lfo-sub-pitch-enabled': true,
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
  waveforms: 'oscillator 1 saw/square/sine mixed + oscillator 2 square at -1 octave',
  oscillator2: 'enabled square, -1 octave, level 0.5',
  noise: '12 independent pink-noise generators, level 0.2, normalized mix',
  subOscillator: 'square, one octave below, level 0.2, one independent phase per note; EG02 +6, EG03 -8 and LFO +5 semitone routes active',
  unison: '4 oscillator lanes per note, symmetric 12-cent detune and 70% stereo spread on OSC 01/02 (maximum supported)',
  filter: 'TPT lowpass, 2.4 kHz, Q 4, per voice',
  filterEnvelope: 'active bipolar +24 semitones, 30 s attack, per voice',
  pitchEnvelope: 'EG 03 active +12/-8 semitones to OSC 01/02, 30 s attack, per voice',
  lfo: '5 Hz sine, +12 semitones to filter cutoff and +5 semitones to Sub pitch, per voice',
  measuredBlocks,
  meanMsPerBlock: Number(mean.toFixed(5)),
  p95BatchMsPerBlock: Number(p95.toFixed(5)),
  realtimeBudgetMs: Number(realTimeBudgetMs.toFixed(5)),
  meanBudgetPercent: Number((mean / realTimeBudgetMs * 100).toFixed(2)),
  p95BudgetPercent: Number((p95 / realTimeBudgetMs * 100).toFixed(2)),
  note: 'Desktop CI runner only; informational, not an Android performance claim.',
}, null, 2));
