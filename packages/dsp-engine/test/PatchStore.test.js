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
    'engine.virtual-analog.osc2-enabled': true,
    'engine.virtual-analog.osc2-wave': 'square',
    'engine.virtual-analog.osc2-level': 0.65,
    'engine.virtual-analog.osc2-octave': -1,
    'engine.virtual-analog.osc2-semitone': 5,
    'engine.virtual-analog.osc2-fine': 12,
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
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc2-enabled'], true);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc2-wave'], 'square');
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc2-level'], 0.65);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc2-octave'], -1);
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
  assert.equal(parameters['engine.virtual-analog.osc2-enabled'], false);
  assert.equal(parameters['engine.virtual-analog.osc2-wave'], 'sine');
  assert.equal(parameters['engine.virtual-analog.osc2-level'], 0.5);
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


test('Virtual Analog patch persists pitch modulation route amounts and enable flags', () => {
  const patch = createVirtualAnalogPatch({
    'engine.virtual-analog.eg-osc1-pitch-amount': 12,
    'engine.virtual-analog.eg-osc1-pitch-enabled': false,
    'engine.virtual-analog.lfo-osc2-pitch-amount': -7.5,
    'engine.virtual-analog.lfo-osc2-pitch-enabled': true,
  });
  const parameters = applyVirtualAnalogPatch(patch);
  assert.equal(parameters['engine.virtual-analog.eg-osc1-pitch-amount'], 12);
  assert.equal(parameters['engine.virtual-analog.eg-osc1-pitch-enabled'], false);
  assert.equal(parameters['engine.virtual-analog.lfo-osc2-pitch-amount'], -7.5);
  assert.equal(parameters['engine.virtual-analog.lfo-osc2-pitch-enabled'], true);
});


test('Virtual Analog patches persist independent EG03 settings and pitch routes', () => {
  const patch = createVirtualAnalogPatch({
    'engine.virtual-analog.pitch-env-attack': 0.025,
    'engine.virtual-analog.pitch-env-decay': 0.4,
    'engine.virtual-analog.pitch-env-sustain': 0.2,
    'engine.virtual-analog.pitch-env-release': 0.7,
    'engine.virtual-analog.pitch-env-osc1-amount': 24,
    'engine.virtual-analog.pitch-env-osc1-enabled': true,
    'engine.virtual-analog.pitch-env-osc2-amount': -12,
    'engine.virtual-analog.pitch-env-osc2-enabled': false,
  });
  const restored = applyVirtualAnalogPatch(patch);
  assert.equal(restored['engine.virtual-analog.pitch-env-attack'], 0.025);
  assert.equal(restored['engine.virtual-analog.pitch-env-decay'], 0.4);
  assert.equal(restored['engine.virtual-analog.pitch-env-sustain'], 0.2);
  assert.equal(restored['engine.virtual-analog.pitch-env-release'], 0.7);
  assert.equal(restored['engine.virtual-analog.pitch-env-osc1-amount'], 24);
  assert.equal(restored['engine.virtual-analog.pitch-env-osc1-enabled'], true);
  assert.equal(restored['engine.virtual-analog.pitch-env-osc2-amount'], -12);
  assert.equal(restored['engine.virtual-analog.pitch-env-osc2-enabled'], false);
});


test('Virtual Analog patches persist noise enable, color and level', () => {
  const patch = createVirtualAnalogPatch({
    'engine.virtual-analog.noise-enabled': true,
    'engine.virtual-analog.noise-color': 'pink',
    'engine.virtual-analog.noise-level': 0.7,
  });
  const restored = applyVirtualAnalogPatch(patch);
  assert.equal(restored['engine.virtual-analog.noise-enabled'], true);
  assert.equal(restored['engine.virtual-analog.noise-color'], 'pink');
  assert.equal(restored['engine.virtual-analog.noise-level'], 0.7);
});


test('Virtual Analog patches persist unison voice count and detune', () => {
  const patch = createVirtualAnalogPatch({
    'engine.virtual-analog.unison-voices': 4,
    'engine.virtual-analog.unison-detune': 18.5,
  });
  const restored = applyVirtualAnalogPatch(patch);
  assert.equal(restored['engine.virtual-analog.unison-voices'], 4);
  assert.equal(restored['engine.virtual-analog.unison-detune'], 18.5);
});


test('Virtual Analog patches persist sub oscillator enable, waveform, level and octave', () => {
  const patch = createVirtualAnalogPatch({
    'engine.virtual-analog.sub-enabled': true,
    'engine.virtual-analog.sub-wave': 'saw',
    'engine.virtual-analog.sub-level': 0.65,
    'engine.virtual-analog.sub-octave': -2,
  });
  const restored = applyVirtualAnalogPatch(patch);
  assert.equal(restored['engine.virtual-analog.sub-enabled'], true);
  assert.equal(restored['engine.virtual-analog.sub-wave'], 'saw');
  assert.equal(restored['engine.virtual-analog.sub-level'], 0.65);
  assert.equal(restored['engine.virtual-analog.sub-octave'], -2);
});


test('legacy Virtual Analog patches missing Sub pitch routes load with neutral defaults', () => {
  const legacyPatch = JSON.parse(JSON.stringify(
    createVirtualAnalogPatch({ 'engine.virtual-analog.sub-enabled': true }, 'Legacy Sub'),
  ));
  const keys = [
    'engine.virtual-analog.eg-sub-pitch-amount',
    'engine.virtual-analog.eg-sub-pitch-enabled',
    'engine.virtual-analog.pitch-env-sub-pitch-amount',
    'engine.virtual-analog.pitch-env-sub-pitch-enabled',
    'engine.virtual-analog.lfo-sub-pitch-amount',
    'engine.virtual-analog.lfo-sub-pitch-enabled',
  ];
  for (const key of keys) delete legacyPatch.engineSlots[0].parameters[key];
  const restored = applyVirtualAnalogPatch(legacyPatch);
  assert.equal(restored['engine.virtual-analog.sub-enabled'], true);
  assert.equal(restored['engine.virtual-analog.eg-sub-pitch-amount'], 0);
  assert.equal(restored['engine.virtual-analog.pitch-env-sub-pitch-amount'], 0);
  assert.equal(restored['engine.virtual-analog.lfo-sub-pitch-amount'], 0);
  assert.equal(restored['engine.virtual-analog.eg-sub-pitch-enabled'], true);
  assert.equal(restored['engine.virtual-analog.pitch-env-sub-pitch-enabled'], true);
  assert.equal(restored['engine.virtual-analog.lfo-sub-pitch-enabled'], true);
});

test('Virtual Analog patches persist Unison stereo spread', () => {
  const patch = createVirtualAnalogPatch({ 'engine.virtual-analog.unison-spread': 72 }, 'Wide Unison');
  const restored = applyVirtualAnalogPatch(patch);
  assert.equal(restored['engine.virtual-analog.unison-spread'], 72);
});
