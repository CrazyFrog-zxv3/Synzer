import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVirtualAnalogPatch,
  applyVirtualAnalogPatch,
  savePatch,
  listPatches,
  loadPatch,
} from '../src/core/PatchStore.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('Virtual Analog patch captures global and engine parameters in separate scopes', () => {
  const patch = createVirtualAnalogPatch({
    'global.master-level': 0.65,
    'engine.virtual-analog.osc-wave': 'square',
    'engine.virtual-analog.amp-attack': 0.02,
    'engine.virtual-analog.amp-decay': 0.12,
    'engine.virtual-analog.amp-sustain': 0.6,
    'engine.virtual-analog.amp-release': 0.4,
  }, 'Warm Square');
  assert.equal(patch.name, 'Warm Square');
  assert.equal(patch.globalParameters['global.master-level'], 0.65);
  assert.equal(patch.engineSlots[0].engineId, 'virtual-analog');
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc-wave'], 'square');
});

test('Virtual Analog patch application restores normalized engine parameters', () => {
  const patch = createVirtualAnalogPatch({
    'global.master-level': 0.3,
    'engine.virtual-analog.osc-wave': 'sine',
  });
  const parameters = applyVirtualAnalogPatch(patch);
  assert.equal(parameters['global.master-level'], 0.3);
  assert.equal(parameters['engine.virtual-analog.osc-wave'], 'sine');
  assert.equal(parameters['engine.virtual-analog.amp-attack'], 0.01);
});

test('local patch store saves, lists and loads without overwriting duplicate names', () => {
  const storage = createStorage();
  const patch = createVirtualAnalogPatch({ 'global.master-level': 0.5 }, 'Soft');
  savePatch(storage, patch);
  assert.deepEqual(listPatches(storage), ['Soft']);
  assert.deepEqual(loadPatch(storage, 'Soft'), patch);
  assert.throws(() => savePatch(storage, patch), /already exists/i);
});

test('patch store rejects malformed storage and unsupported engines on apply', () => {
  const storage = createStorage();
  storage.setItem('synzer.patches.v1', '{broken');
  assert.throws(() => listPatches(storage), /JSON/i);
  const patch = createVirtualAnalogPatch({}, 'Valid');
  const unsupported = {
    ...patch,
    engineSlots: [{ slotId: 'layer-a', engineId: 'wavetable', enabled: true, parameters: {} }],
  };
  assert.throws(() => applyVirtualAnalogPatch(unsupported), /only Virtual Analog/i);
});
