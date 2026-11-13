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
