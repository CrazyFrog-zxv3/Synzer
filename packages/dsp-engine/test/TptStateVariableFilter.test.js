import test from 'node:test';
import assert from 'node:assert/strict';
import { TptStateVariableFilter } from '../src/core/TptStateVariableFilter.js';

function renderFilter({ mode, frequency, cutoff = 1000, resonance = Math.SQRT1_2, sampleRate = 48000, length = 48000 }) {
  const filter = new TptStateVariableFilter({ sampleRate, mode, cutoff, resonance });
  const output = new Float32Array(length);
  const step = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < length; i++) output[i] = filter.process(Math.sin(step * i));
  let real = 0;
  let imaginary = 0;
  const start = Math.floor(length / 2);
  for (let i = start; i < length; i++) {
    const angle = step * i;
    real += output[i] * Math.cos(angle);
    imaginary -= output[i] * Math.sin(angle);
  }
  return (2 * Math.hypot(real, imaginary)) / (length - start);
}

test('filter bypass is transparent and preserves the exact input sample', () => {
  const filter = new TptStateVariableFilter({ sampleRate: 48000, mode: 'off' });
  for (const sample of [0, 0.25, -0.75, 1]) assert.equal(filter.process(sample), sample);
});

test('low-pass attenuates frequencies above its cutoff', () => {
  const pass = renderFilter({ mode: 'lowpass', frequency: 200 });
  const stop = renderFilter({ mode: 'lowpass', frequency: 8000 });
  assert.ok(pass > 0.85, 'low frequency should pass');
  assert.ok(stop < pass * 0.08, 'high frequency should be attenuated');
});

test('high-pass attenuates frequencies below its cutoff', () => {
  const stop = renderFilter({ mode: 'highpass', frequency: 100 });
  const pass = renderFilter({ mode: 'highpass', frequency: 8000 });
  assert.ok(stop < 0.12, 'low frequency should be attenuated');
  assert.ok(pass > 0.85, 'high frequency should pass');
});

test('band-pass passes its center region and attenuates distant frequencies', () => {
  const center = renderFilter({ mode: 'bandpass', frequency: 1000 });
  const low = renderFilter({ mode: 'bandpass', frequency: 100 });
  const high = renderFilter({ mode: 'bandpass', frequency: 10000 });
  assert.ok(center > low * 5);
  assert.ok(center > high * 5);
});

test('filter remains finite for extreme supported cutoff and resonance values', () => {
  for (const mode of ['lowpass', 'highpass', 'bandpass']) {
    const filter = new TptStateVariableFilter({ sampleRate: 44100, mode, cutoff: 20000, resonance: 12 });
    for (let i = 0; i < 200000; i++) {
      const sample = Math.sin(i * 0.31);
      assert.ok(Number.isFinite(filter.process(sample)));
    }
  }
});

test('filter validates configuration and input samples', () => {
  assert.throws(() => new TptStateVariableFilter({ sampleRate: 0 }), RangeError);
  const filter = new TptStateVariableFilter({ sampleRate: 48000 });
  assert.throws(() => filter.setParameters({ mode: 'not-a-filter' }), TypeError);
  assert.throws(() => filter.setParameters({ cutoff: 0 }), RangeError);
  assert.throws(() => filter.setParameters({ resonance: 20 }), RangeError);
  assert.throws(() => filter.process(Number.NaN), TypeError);
});

test('filter coefficients can be changed without resetting its integrator state', () => {
  const filter = new TptStateVariableFilter({ sampleRate: 48000, mode: 'lowpass', cutoff: 500 });
  for (let i = 0; i < 100; i++) filter.process(Math.sin(i * 0.2));
  const before = filter.getState();
  filter.setParameters({ cutoff: 4000, resonance: 1.2 });
  const after = filter.getState();
  assert.deepEqual(after, before);
  assert.ok(Number.isFinite(filter.process(0.1)));
});

test('cutoff automation does not evaluate tangent per update', () => {
  const filter = new TptStateVariableFilter({ sampleRate: 48000, mode: 'lowpass', cutoff: 500 });
  const originalTan = Math.tan;
  Math.tan = () => { throw new Error('Math.tan must not run in the audio parameter update path'); };
  try {
    for (let index = 0; index < 2000; index++) filter.setCutoff(200 + (index * 7.3));
  } finally {
    Math.tan = originalTan;
  }
  assert.ok(Number.isFinite(filter.process(0.25)));
});

test('lookup-based TPT coefficients stay accurate across supported sample rates and cutoff range', () => {
  for (const sampleRate of [8000, 44100, 48000, 96000, 192000, 384000]) {
    for (const cutoff of [20, 35, 100, 440, 1000, 5000, 12000, 20000]) {
      if (cutoff > sampleRate * 0.45) continue;
      const filter = new TptStateVariableFilter({ sampleRate, mode: 'lowpass', cutoff, resonance: Math.SQRT1_2 });
      const actual = filter.process(1);
      const g = Math.tan(Math.PI * cutoff / sampleRate);
      const k = 1 / Math.SQRT1_2;
      const expected = (g * g) / (1 + (g * (g + k)));
      assert.ok(Math.abs(actual - expected) < 1e-6, `coefficient error at ${sampleRate} Hz / ${cutoff} Hz: ${actual} vs ${expected}`);
    }
  }
});

test('filter state can be copied between same-rate channel instances', () => {
  const left = new TptStateVariableFilter({ sampleRate: 48000, mode: 'lowpass', cutoff: 1200, resonance: 2 });
  const right = new TptStateVariableFilter({ sampleRate: 48000, mode: 'lowpass', cutoff: 1200, resonance: 2 });
  for (let index = 0; index < 64; index++) left.process(Math.sin(index * 0.1));
  right.copyStateFrom(left);
  assert.deepEqual(right.getState(), left.getState());
  const next = 0.375;
  assert.equal(right.process(next), left.process(next));
  const incompatible = new TptStateVariableFilter({ sampleRate: 44100 });
  assert.throws(() => incompatible.copyStateFrom(left), /sample rate/i);
});


test('notch filter rejects its center frequency while passing frequencies on both sides', () => {
  const low = renderFilter({ mode: 'notch', frequency: 100 });
  const center = renderFilter({ mode: 'notch', frequency: 1000 });
  const high = renderFilter({ mode: 'notch', frequency: 8000 });
  assert.ok(center < 0.02, 'center frequency should be strongly rejected');
  assert.ok(low > 0.9, 'low frequency should pass');
  assert.ok(high > 0.9, 'high frequency should pass');
});

test('all-pass filter preserves magnitude across low, center, and high frequencies', () => {
  for (const frequency of [100, 1000, 8000, 16000]) {
    const magnitude = renderFilter({ mode: 'allpass', frequency });
    assert.ok(Math.abs(magnitude - 1) < 0.015, `magnitude should remain unity at ${frequency} Hz, received ${magnitude}`);
  }
});

test('notch and all-pass remain finite at extreme supported cutoff and resonance values', () => {
  for (const mode of ['notch', 'allpass']) {
    const filter = new TptStateVariableFilter({ sampleRate: 44100, mode, cutoff: 20000, resonance: 12 });
    for (let i = 0; i < 200000; i++) {
      const sample = Math.sin(i * 0.31);
      assert.ok(Number.isFinite(filter.process(sample)));
    }
  }
});
