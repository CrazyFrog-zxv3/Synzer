import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineRegistry, SYNTHESIS_FAMILIES } from '../src/core/EngineRegistry.js';

test('catalog identifies the current Virtual Analog engine and keeps future families planned', () => {
  assert.equal(SYNTHESIS_FAMILIES.find((item) => item.id === 'virtual-analog').status, 'available');
  for (const id of ['wavetable', 'fm', 'additive', 'sample', 'granular', 'spectral', 'physical-modeling']) {
    assert.equal(SYNTHESIS_FAMILIES.find((item) => item.id === id).status, 'planned');
  }
});

test('registry resolves only registered engine factories', () => {
  const registry = new EngineRegistry();
  const factory = (options) => ({ kind: 'virtual-analog', options });
  registry.register({ id: 'virtual-analog', label: 'Virtual Analog', status: 'available', create: factory });

  assert.deepEqual(registry.create('virtual-analog', { sampleRate: 48000 }), {
    kind: 'virtual-analog',
    options: { sampleRate: 48000 },
  });
  assert.throws(() => registry.create('wavetable'), /not registered/i);
});

test('registry rejects duplicate identifiers and unavailable factories', () => {
  const registry = new EngineRegistry();
  registry.register({ id: 'virtual-analog', label: 'Virtual Analog', status: 'available', create: () => ({}) });
  assert.throws(() => registry.register({ id: 'virtual-analog', label: 'Duplicate', status: 'available', create: () => ({}) }), /already registered/i);
  assert.throws(() => registry.register({ id: 'fm', label: 'FM', status: 'planned' }), /Only available engines/i);
});

test('registry returns immutable metadata snapshots', () => {
  const registry = new EngineRegistry();
  registry.register({ id: 'virtual-analog', label: 'Virtual Analog', status: 'available', create: () => ({}) });
  const entries = registry.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'virtual-analog');
  assert.ok(Object.isFrozen(entries[0]));
  assert.throws(() => { entries[0].label = 'Changed'; }, TypeError);
});
