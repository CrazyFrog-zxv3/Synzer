import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defineParameter,
  normalizeParameterValues,
  createPatch,
  validatePatch,
  serializePatch,
  deserializePatch,
} from '../src/core/PatchSchema.js';

test('parameter definitions require stable namespaced ids and typed defaults', () => {
  assert.throws(() => defineParameter({ id: 'cutoff', type: 'number', defaultValue: 1000 }), /namespaced/i);
  assert.throws(() => defineParameter({ id: 'global.cutoff', type: 'number', defaultValue: NaN }), /finite/i);
  assert.throws(() => defineParameter({ id: 'global.cutoff', type: 'number', defaultValue: 1000, min: 2000, max: 1000 }), /range/i);
  assert.equal(defineParameter({ id: 'global.cutoff', type: 'number', defaultValue: 1000, min: 20, max: 20000 }).defaultValue, 1000);
});

test('parameter values are strictly validated without silent clamping', () => {
  const definitions = [
    defineParameter({ id: 'global.master-level', type: 'number', defaultValue: 0.8, min: 0, max: 1 }),
    defineParameter({ id: 'engine.virtual-analog.osc-wave', type: 'enum', defaultValue: 'saw', choices: ['saw', 'square', 'sine'] }),
    defineParameter({ id: 'global.unison', type: 'boolean', defaultValue: false }),
  ];
  assert.deepEqual(normalizeParameterValues(definitions, { 'global.master-level': 0.4 }), {
    'global.master-level': 0.4,
    'engine.virtual-analog.osc-wave': 'saw',
    'global.unison': false,
  });
  assert.throws(() => normalizeParameterValues(definitions, { 'global.master-level': 1.1 }), /range/i);
  assert.throws(() => normalizeParameterValues(definitions, { 'engine.virtual-analog.osc-wave': 'triangle' }), /choice/i);
  assert.throws(() => normalizeParameterValues(definitions, { 'global.unison': 1 }), /boolean/i);
  assert.throws(() => normalizeParameterValues(definitions, { 'global.unknown': 1 }), /unknown/i);
});

test('patch keeps global parameters and per-engine-slot parameters separate', () => {
  const patch = createPatch({
    name: 'Init',
    globalParameters: { 'global.master-level': 0.7 },
    engineSlots: [{
      slotId: 'layer-a',
      engineId: 'virtual-analog',
      enabled: true,
      parameters: { 'engine.virtual-analog.osc-wave': 'square' },
    }],
  });
  assert.equal(patch.schemaVersion, 1);
  assert.equal(patch.globalParameters['global.master-level'], 0.7);
  assert.equal(patch.engineSlots[0].parameters['engine.virtual-analog.osc-wave'], 'square');
  assert.throws(() => createPatch({ globalParameters: { 'engine.virtual-analog.osc-wave': 'saw' } }), /scope/i);
});

test('patch rejects duplicate slot ids and malformed engine ids', () => {
  const slot = { slotId: 'layer-a', engineId: 'virtual-analog', enabled: true, parameters: {} };
  assert.throws(() => createPatch({ engineSlots: [slot, slot] }), /duplicate/i);
  assert.throws(() => createPatch({ engineSlots: [{ ...slot, engineId: 'Virtual Analog' }] }), /engine id/i);
});

test('patch serialization round-trips and rejects unsupported schema versions', () => {
  const patch = createPatch({
    name: 'Round trip',
    globalParameters: { 'global.master-level': 0.65 },
    engineSlots: [{ slotId: 'layer-a', engineId: 'virtual-analog', enabled: true, parameters: {} }],
  });
  const serialized = serializePatch(patch);
  assert.deepEqual(deserializePatch(serialized), patch);
  assert.throws(() => validatePatch({ ...patch, schemaVersion: 99 }), /schema version/i);
  assert.throws(() => deserializePatch('{broken'), /JSON/i);
});

test('patch validation returns a normalized immutable snapshot', () => {
  const input = {
    schemaVersion: 1,
    name: 'Immutable',
    globalParameters: {},
    engineSlots: [{ slotId: 'layer-a', engineId: 'virtual-analog', enabled: true, parameters: {} }],
  };
  const patch = validatePatch(input);
  assert.ok(Object.isFrozen(patch));
  assert.ok(Object.isFrozen(patch.engineSlots));
  assert.ok(Object.isFrozen(patch.engineSlots[0]));
  input.engineSlots[0].parameters.changed = true;
  assert.deepEqual(patch.engineSlots[0].parameters, {});
});
