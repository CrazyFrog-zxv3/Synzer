import test from 'node:test';
import assert from 'node:assert/strict';
import { StereoDelay } from '../src/core/StereoDelay.js';

test('stereo delay emits a delayed impulse at the configured sample offset', () => {
  const delay = new StereoDelay({ sampleRate: 8000, time: 0.01, feedback: 0, mix: 1 });
  const left = new Float32Array(96);
  const right = new Float32Array(96);
  left[0] = 1;
  delay.process(left, right);
  assert.equal(left[0], 0);
  assert.ok(Math.abs(left[80] - 1) < 1e-6);
  assert.equal(right[80], 0);
});

test('ping-pong feedback alternates echoes between stereo channels', () => {
  const delay = new StereoDelay({ sampleRate: 8000, time: 0.005, feedback: 0.5, mix: 1, pingPong: true });
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  left[0] = 1;
  delay.process(left, right);
  assert.ok(Math.abs(left[40] - 1) < 1e-6);
  assert.ok(Math.abs(right[80] - 0.5) < 1e-6);
  assert.ok(Math.abs(left[120] - 0.25) < 1e-6);
});

test('delay parameter changes are validated and smoothed without non-finite output', () => {
  const delay = new StereoDelay({ sampleRate: 48000 });
  assert.throws(() => delay.setParameters({ time: 0 }), /time/i);
  assert.throws(() => delay.setParameters({ feedback: 1 }), /feedback/i);
  assert.throws(() => delay.setParameters({ mix: -0.1 }), /mix/i);
  delay.setParameters({ time: 0.2, feedback: 0.8, mix: 0.35, pingPong: true });
  const left = new Float32Array(4096);
  const right = new Float32Array(4096);
  left[0] = 0.8;
  delay.process(left, right);
  assert.ok([...left, ...right].every(Number.isFinite));
  assert.equal(delay.getParameters().pingPong, true);
});

test('zero wet mix is transparent while the delay line remains finite', () => {
  const delay = new StereoDelay({ sampleRate: 8000, time: 0.01, feedback: 0.4, mix: 0 });
  const left = new Float32Array([0.25, -0.5, 0.75]);
  const right = new Float32Array([-0.25, 0.5, -0.75]);
  const expectedLeft = left.slice();
  const expectedRight = right.slice();
  delay.process(left, right);
  assert.deepEqual(left, expectedLeft);
  assert.deepEqual(right, expectedRight);
});

test('bypassed delay keeps ingesting input and its echo is available when re-enabled', () => {
  const delay = new StereoDelay({ sampleRate: 8000, time: 0.01, feedback: 0, mix: 1 });
  const inputL = new Float32Array(48);
  const inputR = new Float32Array(48);
  inputL[0] = 1;
  const expectedL = inputL.slice();
  delay.process(inputL, inputR, { bypass: true });
  assert.deepEqual(inputL, expectedL);
  const nextL = new Float32Array(48);
  const nextR = new Float32Array(48);
  delay.process(nextL, nextR);
  assert.ok(Math.abs(nextL[32] - 1) < 1e-6);
});
