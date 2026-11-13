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
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 1800,
    'engine.virtual-analog.filter-resonance': 2.5,
    'engine.virtual-analog.filter-env-attack': 0.4,
    'engine.virtual-analog.filter-env-decay': 0.6,
    'engine.virtual-analog.filter-env-sustain': 0.35,
    'engine.virtual-analog.filter-env-release': 0.8,
    'engine.virtual-analog.filter-env-amount': -18,
    'engine.virtual-analog.lfo1-rate': 4.5,
    'engine.virtual-analog.lfo1-waveform': 'triangle',
    'engine.virtual-analog.lfo1-amount': 15,
    'engine.virtual-analog.filter-env-route-enabled': false,
    'engine.virtual-analog.lfo1-route-enabled': true,
  }, 'Warm Square');
  assert.equal(patch.name, 'Warm Square');
  assert.equal(patch.globalParameters['global.master-level'], 0.65);
  assert.equal(patch.engineSlots[0].engineId, 'virtual-analog');
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc-wave'], 'square');
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.filter-mode'], 'lowpass');
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.filter-cutoff'], 1800);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.filter-resonance'], 2.5);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.filter-env-attack'], 0.4);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.filter-env-amount'], -18);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.lfo1-rate'], 4.5);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.lfo1-waveform'], 'triangle');
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.lfo1-amount'], 15);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.filter-env-route-enabled'], false);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.lfo1-route-enabled'], true);
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
  assert.equal(parameters['engine.virtual-analog.filter-mode'], 'off');
  assert.equal(parameters['engine.virtual-analog.filter-cutoff'], 12000);
  assert.equal(parameters['engine.virtual-analog.filter-env-amount'], 0);
  assert.equal(parameters['engine.virtual-analog.filter-env-sustain'], 0);
  assert.equal(parameters['engine.virtual-analog.lfo1-rate'], 1);
  assert.equal(parameters['engine.virtual-analog.lfo1-waveform'], 'sine');
  assert.equal(parameters['engine.virtual-analog.lfo1-amount'], 0);
  assert.equal(parameters['engine.virtual-analog.filter-env-route-enabled'], true);
  assert.equal(parameters['engine.virtual-analog.lfo1-route-enabled'], true);
});

test('local patch store saves, lists and loads without overwriting duplicate names', () => {
  const storage = createStorage();
  const patch = createVirtualAnalogPatch({ 'global.master-level': 0.5 }, 'Soft');
  savePatch(storage, patch);
  assert.deepEqual(listPatches(storage), ['Soft']);
  assert.deepEqual(loadPatch(storage, 'Soft'), patch);
  assert.throws(() => savePatch(storage, patch), /already exists/i);
  assert.throws(() => savePatch(storage, createVirtualAnalogPatch({}, 'soft')), /already exists/i);
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
  assert.throws(() => applyVirtualAnalogPatch(unsupported), /one enabled Virtual Analog/i);
});
