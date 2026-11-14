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

test('EffectRack parallel mode sums wet-only returns with an explicit headroom budget', () => {
  const trace = [];
  const modules = Object.fromEntries(['delay', 'reverb'].map((name) => [name, {
    process(left, right, options = {}) {
      trace.push({ name, wetOnly: options.wetOnly === true, bypass: options.bypass === true });
      for (let i = 0; i < left.length; i += 1) {
        const inputL = left[i];
        const inputR = right[i];
        if (options.wetOnly) {
          left[i] = options.bypass ? 0 : inputL * (name === 'delay' ? 0.5 : 0.25);
          right[i] = options.bypass ? 0 : inputR * (name === 'delay' ? 0.5 : 0.25);
        } else if (!options.bypass) {
          left[i] = inputL + 1;
          right[i] = inputR + 1;
        }
      }
    },
  }]));
  const rack = new EffectRack(modules);
  rack.setConfiguration({
    mode: 'parallel',
    levels: { delay: { send: 1, return: 1 }, reverb: { send: 1, return: 1 } },
    dryLevel: 1,
    wetLevel: 1,
  });
  const left = new Float32Array([1]);
  const right = new Float32Array([0.5]);
  rack.process(left, right);
  // dry + two returns is normalized by the declared gain budget (1 + 1 + 1).
  assert.ok(Math.abs(left[0] - (1.75 / 3)) < 1e-6);
  assert.ok(Math.abs(right[0] - (0.875 / 3)) < 1e-6);
  assert.deepEqual(trace, [
    { name: 'delay', wetOnly: true, bypass: false },
    { name: 'reverb', wetOnly: true, bypass: false },
  ]);
});

test('EffectRack parallel sends and returns are independently adjustable and bypass keeps processors advancing', () => {
  const trace = [];
  const modules = Object.fromEntries(['delay', 'reverb'].map((name) => [name, {
    process(left, right, options = {}) {
      this.frames = (this.frames ?? 0) + left.length;
      trace.push({ name, bypass: options.bypass === true });
      for (let i = 0; i < left.length; i += 1) {
        left[i] = options.bypass ? 0 : left[i] * 0.5;
        right[i] = options.bypass ? 0 : right[i] * 0.5;
      }
    },
  }]));
  const rack = new EffectRack(modules);
  rack.setConfiguration({ mode: 'parallel', enabled: { delay: false }, levels: { delay: { send: 0.5, return: 0.25 }, reverb: { send: 1.5, return: 0.75 } } });
  const left = new Float32Array([1]);
  const right = new Float32Array([1]);
  rack.process(left, right);
  assert.deepEqual(trace, [{ name: 'delay', bypass: true }, { name: 'reverb', bypass: false }]);
  assert.equal(modules.delay.frames, 1);
  assert.ok(left[0] > 0 && left[0] < 1);
  const config = rack.getConfiguration();
  assert.equal(config.levels.delay.send, 0.5);
  assert.equal(config.levels.reverb.return, 0.75);
});

test('EffectRack rejects invalid parallel routing configuration atomically', () => {
  const trace = [];
  const rack = new EffectRack({ delay: makeEffect('delay', trace, 1), reverb: makeEffect('reverb', trace, 2) });
  assert.throws(() => rack.setConfiguration({ mode: 'matrix' }), /mode/i);
  assert.throws(() => rack.setConfiguration({ levels: { delay: { send: -1 } } }), /send/i);
  assert.throws(() => rack.setConfiguration({ dryLevel: 3 }), /dryLevel/i);
  assert.equal(rack.getConfiguration().mode, 'serial');
});

test('parallel routing sends the original dry signal independently to real Delay and Reverb wet returns', async () => {
  const { StereoDelay } = await import('../src/core/StereoDelay.js');
  const { StereoReverb } = await import('../src/core/StereoReverb.js');
  const rack = new EffectRack({ delay: new StereoDelay({ sampleRate: 8000, time: 0.005, feedback: 0, mix: 0 }), reverb: new StereoReverb({ sampleRate: 8000, roomSize: 0.5, mix: 0 }) });
  rack.setConfiguration({ mode: 'parallel' });
  const left = new Float32Array(512);
  const right = new Float32Array(512);
  left[0] = 1;
  right[0] = 0.5;
  rack.process(left, right);
  const nextLeft = new Float32Array(512);
  const nextRight = new Float32Array(512);
  rack.process(nextLeft, nextRight);
  assert.ok(Math.abs(left[0] - (1 / 3)) < 1e-6);
  assert.ok(Math.abs(right[0] - (0.5 / 3)) < 1e-6);
  assert.ok(left.some((sample, index) => index > 0 && sample !== 0));
  assert.ok(right.some((sample, index) => index > 0 && sample !== 0));
  assert.ok([...left, ...right].every(Number.isFinite));
});

test('parallel routing preserves mono buffers across consecutive blocks', async () => {
  const { StereoDelay } = await import('../src/core/StereoDelay.js');
  const { StereoReverb } = await import('../src/core/StereoReverb.js');
  const rack = new EffectRack({ delay: new StereoDelay({ sampleRate: 8000, time: 0.005 }), reverb: new StereoReverb({ sampleRate: 8000 }) });
  rack.setConfiguration({ mode: 'parallel', levels: { delay: { send: 0.5, return: 0.5 }, reverb: { send: 0.5, return: 0.5 } } });
  const first = new Float32Array(128);
  first[0] = 0.8;
  rack.process(first, first);
  const second = new Float32Array(128);
  rack.process(second, second);
  assert.ok([...first, ...second].every(Number.isFinite));
  assert.equal(rack.getConfiguration().mode, 'parallel');
});

test('parallel send and return gain changes are smoothed across audio samples', () => {
  const modules = Object.fromEntries(['delay', 'reverb'].map((name) => [name, {
    process(left, right, { bypass = false, wetOnly = false } = {}) {
      for (let i = 0; i < left.length; i += 1) {
        left[i] = wetOnly ? (bypass ? 0 : left[i] * 0.5) : left[i];
        if (right !== left) right[i] = wetOnly ? (bypass ? 0 : right[i] * 0.5) : right[i];
      }
    },
  }]));
  const rack = new EffectRack(modules);
  rack.setConfiguration({ mode: 'parallel', enabled: { reverb: false } });
  const first = new Float32Array(128).fill(1);
  rack.process(first);
  const before = first[127];
  rack.setConfiguration({ levels: { delay: { return: 0 } } });
  const next = new Float32Array(128).fill(1);
  rack.process(next);
  assert.ok(next[0] > before && next[0] < 1.05 * before);
  assert.ok(next[127] > next[0]);
});
