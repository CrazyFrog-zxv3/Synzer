import test from 'node:test';
import assert from 'node:assert/strict';
import { WavetableBank, WavetableOscillator, createHarmonicWavetable, createHarmonicWavetableMipBank } from '../src/core/WavetableOscillator.js';

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


test('wavetable mip bank creates power-of-two harmonic ceilings and selects a safe level', () => {
  const partials = Array.from({ length: 64 }, (_, index) => ({ harmonic: index + 1, amplitude: 1 / (index + 1) }));
  const mipBank = createHarmonicWavetableMipBank({ size: 2048, partials });
  assert.deepEqual(mipBank.levels.map((level) => level.maxHarmonic), [1, 2, 4, 8, 16, 32, 64]);
  const selection = mipBank.select(6000, 48000);
  assert.equal(selection.maxHarmonic, 2);
  assert.ok(selection.maxHarmonic * 6000 <= 48000 * 0.5 * 0.9);
  assert.equal(mipBank.select(440, 48000).maxHarmonic, 32);
});

test('wavetable mip bank supports morph frames and rejects invalid partial definitions', () => {
  const mipBank = createHarmonicWavetableMipBank({
    size: 256,
    partialFrames: [
      [{ harmonic: 1, amplitude: 1 }, { harmonic: 8, amplitude: 0.5 }],
      [{ harmonic: 1, amplitude: 0.5 }, { harmonic: 8, amplitude: 1 }],
    ],
  });
  assert.equal(mipBank.frameCount, 2);
  assert.ok(Number.isFinite(mipBank.sample(0.125, 0.5, mipBank.select(100, 48000))));
  assert.throws(() => createHarmonicWavetableMipBank({ size: 256, partials: [] }), /partial/i);
});

test('wavetable oscillator switches mip levels without a discontinuous first sample', () => {
  const mipBank = createHarmonicWavetableMipBank({
    size: 1024,
    partials: Array.from({ length: 32 }, (_, index) => ({ harmonic: index + 1, amplitude: 1 / (index + 1) })),
  });
  const oscillator = new WavetableOscillator({ bank: mipBank, sampleRate: 48000, frequency: 220 });
  oscillator.render(new Float32Array(64));
  const phaseAtChange = oscillator.phase;
  const expectedOldLevel = mipBank.sampleLevel(phaseAtChange, oscillator.morph, oscillator.mipCurrentIndex);
  oscillator.setFrequency(9000);
  const firstAfterChange = oscillator.processSample();
  assert.ok(Math.abs(firstAfterChange - expectedOldLevel) < 1e-6, 'first transition sample should begin at the previous mip level');
  const output = new Float32Array(256);
  oscillator.render(output);
  assert.ok(output.every(Number.isFinite));
  assert.equal(oscillator.mipFadeRemaining, 0);
  assert.equal(oscillator.mipCurrentIndex, oscillator.mipTargetIndex);
});

test('high-frequency mip playback suppresses harmonics beyond the Nyquist safety margin', () => {
  const partials = Array.from({ length: 64 }, (_, index) => ({ harmonic: index + 1, amplitude: 1 / (index + 1) }));
  const mipBank = createHarmonicWavetableMipBank({ size: 2048, partials });
  const oscillator = new WavetableOscillator({ bank: mipBank, sampleRate: 48000, frequency: 6000 });
  oscillator.render(new Float32Array(64));
  oscillator.reset(0);
  const samples = new Float32Array(2048);
  oscillator.render(samples);
  const magnitudeAt = (bin) => {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const angle = (2 * Math.PI * bin * index) / samples.length;
      real += samples[index] * Math.cos(angle);
      imaginary -= samples[index] * Math.sin(angle);
    }
    return Math.hypot(real, imaginary) / samples.length;
  };
  assert.ok(magnitudeAt(256) > 0.1, 'fundamental should remain present');
  assert.ok(magnitudeAt(768) < 1e-4, 'third harmonic should be removed by the selected conservative mip');
});


test('mip levels retain a shared normalization reference and do not pump gain', () => {
  const mipBank = createHarmonicWavetableMipBank({
    size: 1024,
    partials: [{ harmonic: 1, amplitude: 1 }, { harmonic: 8, amplitude: 0.5 }],
  });
  const fundamentalOnly = mipBank.sampleLevel(0.25, 0, 0);
  const fullSpectrum = mipBank.sampleLevel(0.25, 0, mipBank.levels.length - 1);
  assert.ok(Math.abs(fundamentalOnly - fullSpectrum) < 1e-6);
});

test('mip selection respects 44.1 kHz and 48 kHz Nyquist margins at pitch boundaries', () => {
  const mipBank = createHarmonicWavetableMipBank({
    size: 2048,
    partials: Array.from({ length: 64 }, (_, index) => ({ harmonic: index + 1, amplitude: 1 / (index + 1) })),
  });
  for (const sampleRate of [44100, 48000]) {
    for (const frequency of [110, 440, 2200, 5500, sampleRate * 0.4]) {
      const selection = mipBank.select(frequency, sampleRate);
      assert.ok(selection.maxHarmonic * frequency <= sampleRate * 0.5 * 0.9 + 1e-9);
    }
  }
});


test('spectral mip filtering remains below the Nyquist guard at both common audio rates', () => {
  const partials = Array.from({ length: 64 }, (_, index) => ({ harmonic: index + 1, amplitude: 1 / (index + 1) }));
  const mipBank = createHarmonicWavetableMipBank({ size: 2048, partials });
  for (const sampleRate of [44100, 48000]) {
    const frequency = (sampleRate * 256) / 2048;
    const oscillator = new WavetableOscillator({ bank: mipBank, sampleRate, frequency });
    oscillator.render(new Float32Array(64));
    oscillator.reset(0);
    const samples = new Float32Array(2048);
    oscillator.render(samples);
    const magnitudeAt = (bin) => {
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const angle = (2 * Math.PI * bin * index) / samples.length;
        real += samples[index] * Math.cos(angle);
        imaginary -= samples[index] * Math.sin(angle);
      }
      return Math.hypot(real, imaginary) / samples.length;
    };
    assert.ok(magnitudeAt(256) > 0.1, `fundamental missing at ${sampleRate} Hz`);
    assert.ok(magnitudeAt(768) < 1e-4, `third harmonic leaked at ${sampleRate} Hz`);
  }
});
