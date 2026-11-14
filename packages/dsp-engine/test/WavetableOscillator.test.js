import test from 'node:test';
import assert from 'node:assert/strict';
import { WavetableBank, WavetableOscillator, createHarmonicWavetable } from '../src/core/WavetableOscillator.js';

const sine = Float32Array.from({ length: 8 }, (_, i) => Math.sin((i / 8) * Math.PI * 2));
const inverted = Float32Array.from(sine, (value) => -value);

test('wavetable bank interpolates between adjacent phase samples and wraps the cycle', () => {
  const bank = new WavetableBank([Float32Array.from([0, 1, 0, -1])]);
  assert.equal(bank.sample(0), 0);
  assert.equal(bank.sample(0.125), 0.5);
  assert.equal(bank.sample(0.25), 1);
  assert.equal(bank.sample(1), 0);
  assert.equal(bank.sample(-0.25), -1);
});

test('wavetable bank morphs continuously between adjacent frames', () => {
  const bank = new WavetableBank([Float32Array.from([0, 0, 0, 0]), Float32Array.from([1, 1, 1, 1])]);
  assert.equal(bank.sample(0.37, 0), 0);
  assert.equal(bank.sample(0.37, 0.5), 0.5);
  assert.equal(bank.sample(0.37, 1), 1);
});

test('wavetable bank validates frame shape and rejects non-finite samples', () => {
  assert.throws(() => new WavetableBank([]), /at least one frame/i);
  assert.throws(() => new WavetableBank([new Float32Array(6)]), /power of two/i);
  assert.throws(() => new WavetableBank([new Float32Array(4), new Float32Array(8)]), /same length/i);
  assert.throws(() => new WavetableBank([[0, 1, NaN, -1]]), /finite/i);
});

test('wavetable bank owns its frame data and exposes defensive copies', () => {
  const source = Float32Array.from([0, 1, 0, -1]);
  const bank = new WavetableBank([source]);
  source[1] = 99;
  assert.equal(bank.sample(0.25), 1);
  const copy = bank.getFrame(0);
  copy[1] = -99;
  assert.equal(bank.sample(0.25), 1);
});

test('wavetable oscillator advances phase at the requested frequency and wraps', () => {
  const bank = new WavetableBank([sine]);
  const oscillator = new WavetableOscillator({ bank, sampleRate: 8000, frequency: 2000 });
  assert.equal(oscillator.processSample(), 0);
  assert.ok(Math.abs(oscillator.processSample() - 1) < 1e-6);
  assert.ok(Math.abs(oscillator.processSample()) < 1e-6);
  assert.ok(Math.abs(oscillator.processSample() + 1) < 1e-6);
  assert.equal(oscillator.phase, 0);
});

test('wavetable oscillator renders finite output and supports live frequency and morph updates', () => {
  const bank = new WavetableBank([sine, inverted]);
  const oscillator = new WavetableOscillator({ bank, sampleRate: 48000, frequency: 440, morph: 0.25 });
  oscillator.setMorph(0.75);
  const output = new Float32Array(256);
  oscillator.render(output);
  assert.ok(output.every(Number.isFinite));
  assert.ok(output.some((sample) => Math.abs(sample) > 0.1));
  const phase = oscillator.phase;
  oscillator.setFrequency(880);
  oscillator.setMorph(0.25);
  assert.equal(oscillator.phase, phase);
  assert.throws(() => oscillator.setFrequency(NaN), /finite|45%/i);
});

test('harmonic table generator produces normalized periodic frames', () => {
  const table = createHarmonicWavetable({ size: 256, partials: [{ harmonic: 1, amplitude: 1 }, { harmonic: 2, amplitude: 0.5 }] });
  assert.equal(table.length, 256);
  assert.ok(table.every(Number.isFinite));
  assert.ok(Math.max(...table.map(Math.abs)) <= 1.000001);
  assert.ok(Math.abs(table[0]) < 1e-6);
  assert.throws(() => createHarmonicWavetable({ size: 255, partials: [{ harmonic: 1, amplitude: 1 }] }), /power of two/i);
});
