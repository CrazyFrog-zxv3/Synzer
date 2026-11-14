import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultWavetableDefinition, DEFAULT_WAVETABLE_PARTIAL_FRAMES } from '../src/core/WavetablePresets.js';

test('default Wavetable preset exposes three immutable morph frames and bounded morph values', () => {
  const definition = createDefaultWavetableDefinition(0.65);
  assert.equal(definition.size, 2048);
  assert.equal(definition.morph, 0.65);
  assert.equal(definition.partialFrames, DEFAULT_WAVETABLE_PARTIAL_FRAMES);
  assert.equal(definition.partialFrames.length, 3);
  assert.ok(Object.isFrozen(definition.partialFrames));
  assert.throws(() => createDefaultWavetableDefinition(-0.1), RangeError);
  assert.throws(() => createDefaultWavetableDefinition(1.1), RangeError);
});
