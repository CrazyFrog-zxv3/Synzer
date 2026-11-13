import { defineParameter, normalizeParameterValues } from './PatchSchema.js';

export const VIRTUAL_ANALOG_PARAMETER_DEFINITIONS = Object.freeze([
  defineParameter({
    id: 'global.master-level',
    type: 'number',
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'linear',
  }),
  defineParameter({
    id: 'engine.virtual-analog.osc-wave',
    type: 'enum',
    defaultValue: 'saw',
    choices: ['saw', 'square', 'sine'],
  }),
  defineParameter({
    id: 'engine.virtual-analog.amp-attack',
    type: 'number',
    defaultValue: 0.01,
    min: 0,
    max: 30,
    step: 0.001,
    unit: 's',
  }),
  defineParameter({
    id: 'engine.virtual-analog.amp-decay',
    type: 'number',
    defaultValue: 0.08,
    min: 0,
    max: 30,
    step: 0.001,
    unit: 's',
  }),
  defineParameter({
    id: 'engine.virtual-analog.amp-sustain',
    type: 'number',
    defaultValue: 0.75,
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'linear',
  }),
  defineParameter({
    id: 'engine.virtual-analog.amp-release',
    type: 'number',
    defaultValue: 0.25,
    min: 0,
    max: 60,
    step: 0.001,
    unit: 's',
  }),
  defineParameter({
    id: 'engine.virtual-analog.filter-mode',
    type: 'enum',
    defaultValue: 'off',
    choices: ['off', 'lowpass', 'highpass', 'bandpass'],
  }),
  defineParameter({
    id: 'engine.virtual-analog.filter-cutoff',
    type: 'number',
    defaultValue: 12000,
    min: 20,
    max: 20000,
    step: 1,
    unit: 'Hz',
  }),
  defineParameter({
    id: 'engine.virtual-analog.filter-resonance',
    type: 'number',
    defaultValue: Math.SQRT1_2,
    min: 0.5,
    max: 12,
    step: 0.01,
    unit: 'Q',
  }),
]);

export function createDefaultVirtualAnalogParameters() {
  return normalizeParameterValues(VIRTUAL_ANALOG_PARAMETER_DEFINITIONS, {});
}

export function normalizeVirtualAnalogParameters(values = {}) {
  return normalizeParameterValues(VIRTUAL_ANALOG_PARAMETER_DEFINITIONS, values);
}
