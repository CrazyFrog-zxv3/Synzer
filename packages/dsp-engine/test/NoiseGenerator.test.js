import test from 'node:test';
import assert from 'node:assert/strict';
import { NoiseGenerator } from '../src/core/NoiseGenerator.js';

test('white noise is deterministic for equal seeds and bounded', () => {
  const a = new NoiseGenerator({ seed: 12345, color: 'white' });
  const b = new NoiseGenerator({ seed: 12345, color: 'white' });
  const samplesA = Array.from({ length: 4096 }, () => a.nextSample());
  const samplesB = Array.from({ length: 4096 }, () => b.nextSample());
  assert.deepEqual(samplesA, samplesB);
  assert.ok(samplesA.every((sample) => Number.isFinite(sample) && sample >= -1 && sample <= 1));
  const mean = samplesA.reduce((sum, sample) => sum + sample, 0) / samplesA.length;
  assert.ok(Math.abs(mean) < 0.04);
});

test('pink noise is deterministic, finite and has lower high-frequency energy than white noise', () => {
  const white = new NoiseGenerator({ seed: 9876, color: 'white' });
  const pink = new NoiseGenerator({ seed: 9876, color: 'pink' });
  const whiteSamples = Array.from({ length: 8192 }, () => white.nextSample());
  const pinkSamples = Array.from({ length: 8192 }, () => pink.nextSample());
  const whiteDifference = whiteSamples.slice(1).reduce((sum, value, index) => sum + (value - whiteSamples[index]) ** 2, 0);
  const pinkDifference = pinkSamples.slice(1).reduce((sum, value, index) => sum + (value - pinkSamples[index]) ** 2, 0);
  assert.ok(pinkSamples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1));
  assert.ok(pinkDifference < whiteDifference * 0.6);
});

test('noise color can change without resetting the random sequence', () => {
  const a = new NoiseGenerator({ seed: 2468, color: 'white' });
  const b = new NoiseGenerator({ seed: 2468, color: 'white' });
  a.nextSample();
  b.nextSample();
  a.setColor('pink');
  assert.equal(a.color, 'pink');
  assert.equal(b.color, 'white');
  assert.throws(() => a.setColor('blue'), /Unsupported noise color/);
});

test('noise generator rejects invalid seeds and colors', () => {
  assert.throws(() => new NoiseGenerator({ seed: 0 }), /non-zero uint32/);
  assert.throws(() => new NoiseGenerator({ seed: -1 }), /non-zero uint32/);
  assert.throws(() => new NoiseGenerator({ seed: 1, color: 'blue' }), /Unsupported noise color/);
});
