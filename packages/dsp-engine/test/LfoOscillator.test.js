import test from 'node:test';
import assert from 'node:assert/strict';
import { LfoOscillator } from '../src/core/LfoOscillator.js';

test('LFO sine output follows its configured frequency and stays in bipolar range', () => {
  const lfo = new LfoOscillator({ sampleRate: 8000, rate: 2, waveform: 'sine' });
  assert.ok(Math.abs(lfo.nextSample()) < 1e-12);
  let sample = 0;
  for (let index = 0; index < 999; index++) sample = lfo.nextSample();
  assert.ok(Math.abs(sample - 1) < 1e-6);
  for (let index = 0; index < 3000; index++) {
    sample = lfo.nextSample();
    assert.ok(sample >= -1 && sample <= 1);
  }
});

test('triangle, square, saw-up and saw-down waveforms have the expected polarity', () => {
  const cases = [
    ['triangle', -1],
    ['square', 1],
    ['saw-up', -1],
    ['saw-down', 1],
  ];
  for (const [waveform, expected] of cases) {
    const lfo = new LfoOscillator({ sampleRate: 8000, rate: 1, waveform });
    assert.equal(lfo.nextSample(), expected);
  }
});

test('LFO rejects unsupported sample rates, frequencies and waveforms', () => {
  assert.throws(() => new LfoOscillator({ sampleRate: 0 }), RangeError);
  assert.throws(() => new LfoOscillator({ sampleRate: 8000, rate: 0 }), RangeError);
  assert.throws(() => new LfoOscillator({ sampleRate: 8000, rate: 21 }), RangeError);
  assert.throws(() => new LfoOscillator({ sampleRate: 8000, waveform: 'noise' }), TypeError);
});

test('changing LFO rate or waveform preserves its phase', () => {
  const lfo = new LfoOscillator({ sampleRate: 8000, rate: 1 });
  for (let index = 0; index < 100; index++) lfo.nextSample();
  const phase = lfo.phase;
  lfo.setParameters({ rate: 4, waveform: 'square' });
  assert.equal(lfo.phase, phase);
  assert.equal(lfo.getParameters().rate, 4);
  assert.equal(lfo.getParameters().waveform, 'square');
});
