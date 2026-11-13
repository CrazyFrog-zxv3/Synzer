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
    'engine.virtual-analog.filter-env-attack',
    'engine.virtual-analog.filter-env-decay',
    'engine.virtual-analog.filter-env-sustain',
    'engine.virtual-analog.filter-env-release',
    'engine.virtual-analog.filter-env-amount',
    'engine.virtual-analog.lfo1-rate',
    'engine.virtual-analog.lfo1-waveform',
    'engine.virtual-analog.lfo1-amount',
    'engine.virtual-analog.filter-env-route-enabled',
    'engine.virtual-analog.lfo1-route-enabled',
    'engine.virtual-analog.osc2-enabled',
    'engine.virtual-analog.osc2-wave',
    'engine.virtual-analog.osc2-level',
    'engine.virtual-analog.osc2-octave',
    'engine.virtual-analog.osc2-semitone',
    'engine.virtual-analog.osc2-fine',
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
    'engine.virtual-analog.filter-env-attack': 0.01,
    'engine.virtual-analog.filter-env-decay': 0.3,
    'engine.virtual-analog.filter-env-sustain': 0,
    'engine.virtual-analog.filter-env-release': 0.25,
    'engine.virtual-analog.filter-env-amount': 0,
    'engine.virtual-analog.lfo1-rate': 1,
    'engine.virtual-analog.lfo1-waveform': 'sine',
    'engine.virtual-analog.lfo1-amount': 0,
    'engine.virtual-analog.filter-env-route-enabled': true,
    'engine.virtual-analog.lfo1-route-enabled': true,
    'engine.virtual-analog.osc2-enabled': false,
    'engine.virtual-analog.osc2-wave': 'sine',
    'engine.virtual-analog.osc2-level': 0.5,
    'engine.virtual-analog.osc2-octave': 0,
    'engine.virtual-analog.osc2-semitone': 0,
    'engine.virtual-analog.osc2-fine': 0,
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


test('filter envelope validates ADSR ranges and bipolar semitone depth', () => {
  const values = normalizeVirtualAnalogParameters({
    'engine.virtual-analog.filter-env-attack': 0.5,
    'engine.virtual-analog.filter-env-decay': 0.75,
    'engine.virtual-analog.filter-env-sustain': 0.6,
    'engine.virtual-analog.filter-env-release': 1.25,
    'engine.virtual-analog.filter-env-amount': -36,
  });
  assert.equal(values['engine.virtual-analog.filter-env-amount'], -36);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.filter-env-attack': -0.1 }), /range/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.filter-env-sustain': 1.1 }), /range/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.filter-env-amount': 49 }), /range/i);
});


test('LFO parameter definitions validate rate, waveform and bipolar depth', () => {
  const values = normalizeVirtualAnalogParameters({
    'engine.virtual-analog.lfo1-rate': 5.25,
    'engine.virtual-analog.lfo1-waveform': 'triangle',
    'engine.virtual-analog.lfo1-amount': 24,
  });
  assert.equal(values['engine.virtual-analog.lfo1-rate'], 5.25);
  assert.equal(values['engine.virtual-analog.lfo1-waveform'], 'triangle');
  assert.equal(values['engine.virtual-analog.lfo1-amount'], 24);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.lfo1-rate': 0 }), /range/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.lfo1-waveform': 'noise' }), /choice/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.lfo1-amount': 49 }), /range/i);
});


test('modulation route enable flags are typed booleans', () => {
  const values = normalizeVirtualAnalogParameters({
    'engine.virtual-analog.filter-env-route-enabled': false,
    'engine.virtual-analog.lfo1-route-enabled': true,
  });
  assert.equal(values['engine.virtual-analog.filter-env-route-enabled'], false);
  assert.equal(values['engine.virtual-analog.lfo1-route-enabled'], true);
  assert.throws(() => normalizeVirtualAnalogParameters({
    'engine.virtual-analog.filter-env-route-enabled': 'false',
  }), /boolean/i);
});


test('second oscillator validates waveform, level and pitch offsets', () => {
  const values = normalizeVirtualAnalogParameters({
    'engine.virtual-analog.osc2-enabled': true,
    'engine.virtual-analog.osc2-wave': 'square',
    'engine.virtual-analog.osc2-level': 0.75,
    'engine.virtual-analog.osc2-octave': -1,
    'engine.virtual-analog.osc2-semitone': 7,
    'engine.virtual-analog.osc2-fine': -25,
  });
  assert.equal(values['engine.virtual-analog.osc2-enabled'], true);
  assert.equal(values['engine.virtual-analog.osc2-wave'], 'square');
  assert.equal(values['engine.virtual-analog.osc2-level'], 0.75);
  assert.equal(values['engine.virtual-analog.osc2-octave'], -1);
  assert.equal(values['engine.virtual-analog.osc2-semitone'], 7);
  assert.equal(values['engine.virtual-analog.osc2-fine'], -25);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.osc2-level': 1.1 }), /range/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.osc2-wave': 'noise' }), /choice/i);
  assert.throws(() => normalizeVirtualAnalogParameters({ 'engine.virtual-analog.osc2-octave': 3 }), /range/i);
});
