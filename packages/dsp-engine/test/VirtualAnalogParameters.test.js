import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIRTUAL_ANALOG_PARAMETER_DEFINITIONS,
  createDefaultVirtualAnalogParameters,
  normalizeVirtualAnalogParameters,
} from '../src/core/VirtualAnalogParameters.js';

test('Virtual Analog exposes stable typed parameter definitions', () => {
  const ids = VIRTUAL_ANALOG_PARAMETER_DEFINITIONS.map((item) => item.id);
  assert.deepEqual(ids, [
    'global.master-level',
    'engine.virtual-analog.osc-wave',
    'engine.virtual-analog.amp-attack',
    'engine.virtual-analog.amp-decay',
    'engine.virtual-analog.amp-sustain',
    'engine.virtual-analog.amp-release',
    'engine.virtual-analog.filter-mode',
    'engine.virtual-analog.filter-cutoff',
    'engine.virtual-analog.filter-resonance',
  ]);
  assert.ok(VIRTUAL_ANALOG_PARAMETER_DEFINITIONS.every(Object.isFrozen));
});

test('default Virtual Analog parameters preserve the current engine behavior', () => {
  assert.deepEqual(createDefaultVirtualAnalogParameters(), {
    'global.master-level': 1,
    'engine.virtual-analog.osc-wave': 'saw',
    'engine.virtual-analog.amp-attack': 0.01,
    'engine.virtual-analog.amp-decay': 0.08,
    'engine.virtual-analog.amp-sustain': 0.75,
    'engine.virtual-analog.amp-release': 0.25,
    'engine.virtual-analog.filter-mode': 'off',
    'engine.virtual-analog.filter-cutoff': 12000,
    'engine.virtual-analog.filter-resonance': Math.SQRT1_2,
  });
});

test('normalization fills defaults and validates type, scope, range and enum choices', () => {
  const normalized = normalizeVirtualAnalogParameters({
    'global.master-level': 0.5,
    'engine.virtual-analog.osc-wave': 'sine',
  });
  assert.equal(normalized['global.master-level'], 0.5);
  assert.equal(normalized['engine.virtual-analog.osc-wave'], 'sine');
  assert.equal(normalized['engine.virtual-analog.amp-attack'], 0.01);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'global.master-level': 2 }), /range/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.osc-wave': 'triangle' }), /choice/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.wavetable.position': 0.5 }), /unknown/i);
});


test('filter parameter definitions validate modes, cutoff and resonance', () => {
  const normalized = normalizeVirtualAnalogParameters({
    'engine.virtual-analog.filter-mode': 'bandpass',
    'engine.virtual-analog.filter-cutoff': 2400,
    'engine.virtual-analog.filter-resonance': 4,
  });
  assert.equal(normalized['engine.virtual-analog.filter-mode'], 'bandpass');
  assert.equal(normalized['engine.virtual-analog.filter-cutoff'], 2400);
  assert.equal(normalized['engine.virtual-analog.filter-resonance'], 4);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.filter-mode': 'notch' }), /choice/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.filter-cutoff': 10 }), /range/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.filter-resonance': 13 }), /range/i);
});
