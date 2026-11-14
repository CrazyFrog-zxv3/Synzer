import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectRack } from '../src/core/EffectRack.js';

function makeEffect(name, trace, amount) {
  return { process(left, right, { bypass = false } = {}) { trace.push({ name, bypass }); if (!bypass) for (let i = 0; i < left.length; i += 1) { left[i] += amount; if (right !== left) right[i] += amount; } return { left, right }; } };
}

test('EffectRack processes enabled modules in the configured order', () => {
  const trace = [];
  const rack = new EffectRack({ delay: makeEffect('delay', trace, 1), reverb: makeEffect('reverb', trace, 2) });
  rack.setConfiguration({ order: ['reverb', 'delay'] });
  const left = new Float32Array([0, 0]);
  const right = new Float32Array([0, 0]);
  rack.process(left, right);
  assert.deepEqual(trace, [{ name: 'reverb', bypass: false }, { name: 'delay', bypass: false }]);
  assert.deepEqual([...left], [3, 3]);
  assert.deepEqual([...right], [3, 3]);
});

test('EffectRack bypasses disabled modules without changing their state', () => {
  const trace = [];
  const rack = new EffectRack({ delay: makeEffect('delay', trace, 1), reverb: makeEffect('reverb', trace, 2) });
  rack.setConfiguration({ enabled: { delay: false } });
  const left = new Float32Array([4]);
  rack.process(left);
  assert.deepEqual(trace, [{ name: 'delay', bypass: true }, { name: 'reverb', bypass: false }]);
  assert.equal(left[0], 6);
});

test('EffectRack rejects incomplete, duplicate, or unknown order entries atomically', () => {
  const trace = [];
  const rack = new EffectRack({ delay: makeEffect('delay', trace, 1), reverb: makeEffect('reverb', trace, 2) });
  assert.throws(() => rack.setConfiguration({ order: ['delay', 'delay'] }), /order/i);
  assert.throws(() => rack.setConfiguration({ order: ['delay', 'unknown'] }), /order/i);
  assert.deepEqual(rack.getConfiguration().order, ['delay', 'reverb']);
});

test('EffectRack validates enable flags and preserves mono buffers', () => {
  const trace = [];
  const rack = new EffectRack({ delay: makeEffect('delay', trace, 0.5), reverb: makeEffect('reverb', trace, 0.25) });
  assert.throws(() => rack.setConfiguration({ enabled: { delay: 1 } }), /enabled/i);
  const mono = new Float32Array([1, 2]);
  rack.process(mono, mono);
  assert.deepEqual([...mono], [1.75, 2.75]);
});

test('EffectRack keeps bypassed modules processing internally while preserving the dry signal', () => {
  const trace = [];
  const modules = Object.fromEntries(['delay', 'reverb'].map((name) => [name, {
    process(left, right, options = {}) {
      trace.push({ name, bypass: options.bypass === true });
      for (let i = 0; i < left.length; i += 1) {
        const dryL = left[i];
        const dryR = right[i];
        this.state = (this.state ?? 0) + dryL + dryR;
        if (!options.bypass) { left[i] = dryL + 1; right[i] = dryR + 1; }
      }
    },
  }]));
  const rack = new EffectRack(modules);
  rack.setConfiguration({ enabled: { delay: false } });
  const left = new Float32Array([0.25]);
  const right = new Float32Array([-0.25]);
  rack.process(left, right);
  assert.deepEqual(trace, [{ name: 'delay', bypass: true }, { name: 'reverb', bypass: false }]);
  assert.equal(modules.delay.state, 0);
  assert.deepEqual([...left], [1.25]);
  assert.deepEqual([...right], [0.75]);
});
