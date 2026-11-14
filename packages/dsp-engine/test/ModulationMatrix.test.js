import test from 'node:test';
import assert from 'node:assert/strict';
import { ModulationMatrix } from '../src/core/ModulationMatrix.js';

const routes = [
  { id: 'eg-filter', source: 'filter-envelope', destination: 'filter-cutoff', amount: 12, enabled: true },
  { id: 'lfo-filter', source: 'lfo-1', destination: 'filter-cutoff', amount: -6, enabled: true },
];

test('modulation matrix sums enabled bipolar source routes per destination', () => {
  const matrix = new ModulationMatrix(routes);
  const result = matrix.computeDestination('filter-cutoff', {
    'filter-envelope': 0.5,
    'lfo-1': -1,
  });
  assert.equal(result, 12);
});

test('disabled routes do not contribute and route updates preserve other entries', () => {
  const matrix = new ModulationMatrix(routes);
  matrix.setRoute('eg-filter', { enabled: false });
  assert.equal(matrix.computeDestination('filter-cutoff', {
    'filter-envelope': 1,
    'lfo-1': 1,
  }), -6);
  matrix.setRoute('eg-filter', { amount: 24, enabled: true });
  assert.equal(matrix.computeDestination('filter-cutoff', {
    'filter-envelope': 0.5,
    'lfo-1': 0,
  }), 12);
});

test('modulation matrix validates sources, destinations, ids and values atomically', () => {
  const matrix = new ModulationMatrix(routes);
  const before = matrix.getRoutes();
  assert.throws(() => matrix.setRoutes([
    { id: 'valid', source: 'filter-envelope', destination: 'filter-cutoff', amount: 1, enabled: true },
    { id: 'invalid', source: 'noise', destination: 'filter-cutoff', amount: 1, enabled: true },
  ]), /source/i);
  assert.deepEqual(matrix.getRoutes(), before);
  assert.throws(() => new ModulationMatrix([
    { id: 'duplicate', source: 'filter-envelope', destination: 'filter-cutoff', amount: 1, enabled: true },
    { id: 'duplicate', source: 'lfo-1', destination: 'filter-cutoff', amount: 1, enabled: true },
  ]), /duplicate/i);
  assert.throws(() => matrix.setRoute('eg-filter', { amount: 49 }), /range/i);
  assert.throws(() => matrix.setRoute('missing', { enabled: false }), /not found/i);
});

test('modulation matrix returns defensive route snapshots and zero for unknown destinations', () => {
  const matrix = new ModulationMatrix(routes);
  const snapshot = matrix.getRoutes();
  snapshot[0].amount = -48;
  assert.equal(matrix.getRoutes()[0].amount, 12);
  assert.equal(matrix.computeDestination('unknown', { 'filter-envelope': 1 }), 0);
});


test('compiled filter-cutoff route coefficients match the generic matrix sum', () => {
  const matrix = new ModulationMatrix(routes);
  assert.equal(matrix.computeFilterCutoff(0.5, -1), 12);
  matrix.setRoute('eg-filter', { enabled: false });
  assert.equal(matrix.computeFilterCutoff(1, 1), -6);
});


test('modulation matrix compiles independent pitch destinations for both oscillators', () => {
  const matrix = new ModulationMatrix([
    { id: 'lfo-osc1', source: 'lfo-1', destination: 'oscillator-1-pitch', amount: 7, enabled: true },
    { id: 'eg-osc2', source: 'filter-envelope', destination: 'oscillator-2-pitch', amount: -12, enabled: true },
  ]);
  assert.equal(matrix.lfoOsc1PitchAmount, 7);
  assert.equal(matrix.filterEnvelopeOsc2PitchAmount, -12);
  assert.equal(matrix.filterEnvelopeOsc1PitchAmount, 0);
  assert.equal(matrix.lfoOsc2PitchAmount, 0);
  assert.equal(matrix.computeDestination('oscillator-1-pitch', { 'lfo-1': 1 }), 7);
  assert.equal(matrix.computeDestination('oscillator-2-pitch', { 'filter-envelope': 1 }), -12);
});

test('modulation matrix compiles pitch envelope routes independently for both oscillators', () => {
  const matrix = new ModulationMatrix([
    { id: 'pitch-env-osc1', source: 'pitch-envelope', destination: 'oscillator-1-pitch', amount: 12, enabled: true },
    { id: 'pitch-env-osc2', source: 'pitch-envelope', destination: 'oscillator-2-pitch', amount: -12, enabled: true },
  ]);
  assert.equal(matrix.pitchEnvelopeOsc1PitchAmount, 12);
  assert.equal(matrix.pitchEnvelopeOsc2PitchAmount, -12);
  assert.equal(matrix.computeDestination('oscillator-1-pitch', { 'pitch-envelope': 1 }), 12);
  assert.equal(matrix.computeDestination('oscillator-2-pitch', { 'pitch-envelope': 1 }), -12);
});
