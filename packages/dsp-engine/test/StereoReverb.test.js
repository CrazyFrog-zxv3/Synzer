import test from 'node:test';
import assert from 'node:assert/strict';
import { StereoReverb } from '../src/core/StereoReverb.js';

test('stereo reverb produces a finite decaying tail from an impulse', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0.7 });
  const left = new Float32Array(12000);
  const right = new Float32Array(12000);
  left[0] = 1;
  reverb.process(left, right);
  assert.ok(left.some((sample, index) => index > 100 && Math.abs(sample) > 1e-5));
  assert.ok(right.some((sample, index) => index > 100 && Math.abs(sample) > 1e-5));
  assert.ok([...left, ...right].every(Number.isFinite));
  assert.ok(Math.max(...left.slice(8000).map(Math.abs)) < 0.2);
});

test('zero wet mix is transparent while the reverb network keeps finite state', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 0 });
  const left = new Float32Array([0.25, -0.5, 0.75]);
  const right = new Float32Array([-0.25, 0.5, -0.75]);
  const expectedLeft = left.slice();
  const expectedRight = right.slice();
  reverb.process(left, right);
  assert.deepEqual(left, expectedLeft);
  assert.deepEqual(right, expectedRight);
});

test('reverb parameters validate ranges and update room, damping and stereo width', () => {
  const reverb = new StereoReverb({ sampleRate: 48000 });
  assert.throws(() => reverb.setParameters({ roomSize: 1.2 }), /roomSize/i);
  assert.throws(() => reverb.setParameters({ damping: -0.1 }), /damping/i);
  assert.throws(() => reverb.setParameters({ mix: 2 }), /mix/i);
  assert.throws(() => reverb.setParameters({ width: 1.1 }), /width/i);
  assert.deepEqual(reverb.setParameters({ roomSize: 0.82, damping: 0.6, mix: 0.4, width: 0.9 }), {
    roomSize: 0.82, damping: 0.6, mix: 0.4, width: 0.9, preDelayMs: 0, earlyLevel: 0.65, modulationRateHz: 0.35, modulationDepthMs: 0,
  });
});

test('predelay postpones the wet response by the configured number of samples', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, preDelayMs: 10, earlyLevel: 0 });
  const left = new Float32Array(512);
  const right = new Float32Array(512);
  left[0] = 1;
  reverb.process(left, right);
  assert.equal(left.slice(0, 79).every((sample) => sample === 0), true);
  assert.ok(left.slice(80).some((sample) => Math.abs(sample) > 1e-5));
});

test('early reflections create discrete stereo arrivals before the diffuse tail', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0, preDelayMs: 0, earlyLevel: 1 });
  const left = new Float32Array(512);
  const right = new Float32Array(512);
  left[0] = 1;
  reverb.process(left, right);
  assert.ok(left.slice(55, 65).some((sample) => Math.abs(sample) > 1e-4));
  assert.ok(right.slice(70, 75).some((sample) => Math.abs(sample) > 1e-4));
  assert.ok(left.some(Number.isFinite) && right.some(Number.isFinite));
});

test('predelay and early reflection parameters validate and update independently', () => {
  const reverb = new StereoReverb({ sampleRate: 48000 });
  assert.throws(() => reverb.setParameters({ preDelayMs: -1 }), /preDelayMs/i);
  assert.throws(() => reverb.setParameters({ preDelayMs: 201 }), /preDelayMs/i);
  assert.throws(() => reverb.setParameters({ earlyLevel: 1.1 }), /earlyLevel/i);
  assert.deepEqual(reverb.setParameters({ preDelayMs: 42, earlyLevel: 0.65 }), {
    roomSize: 0.72, damping: 0.35, mix: 0, width: 0.8, preDelayMs: 42, earlyLevel: 0.65, modulationRateHz: 0.35, modulationDepthMs: 0,
  });
});

test('stereo width collapses the complete wet field, including early reflections, to mono at zero', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, width: 0, roomSize: 0.4, earlyLevel: 1 });
  const left = new Float32Array(4096);
  const right = new Float32Array(4096);
  left[0] = 1;
  right[0] = 1;
  reverb.process(left, right);
  for (let i = 0; i < left.length; i += 1) {
    assert.ok(Math.abs(left[i] - right[i]) < 1e-7, `wet mono mismatch at sample ${i}`);
  }
});

test('maximum room size remains finite and bounded during a long impulse decay', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0.98, damping: 0.05, width: 1 });
  const left = new Float32Array(80000);
  const right = new Float32Array(80000);
  left[0] = 1;
  right[0] = 1;
  reverb.process(left, right);
  assert.ok([...left, ...right].every(Number.isFinite));
  assert.ok(Math.max(...left.map(Math.abs)) < 1);
  assert.ok(Math.max(...right.map(Math.abs)) < 1);
});

test('reset clears delay and diffusion history for a repeatable impulse response', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, preDelayMs: 12, earlyLevel: 0.8 });
  const renderImpulse = () => {
    const left = new Float32Array(4096);
    const right = new Float32Array(4096);
    left[0] = 1;
    right[0] = 0.5;
    reverb.process(left, right);
    return [left, right];
  };
  const first = renderImpulse();
  reverb.reset();
  const second = renderImpulse();
  assert.deepEqual(second[0], first[0]);
  assert.deepEqual(second[1], first[1]);
});


test('tail modulation parameters validate and update independently', () => {
  const reverb = new StereoReverb({ sampleRate: 48000 });
  assert.throws(() => reverb.setParameters({ modulationRateHz: 0 }), /modulationRateHz/i);
  assert.throws(() => reverb.setParameters({ modulationRateHz: 3 }), /modulationRateHz/i);
  assert.throws(() => reverb.setParameters({ modulationDepthMs: -0.1 }), /modulationDepthMs/i);
  assert.throws(() => reverb.setParameters({ modulationDepthMs: 2.1 }), /modulationDepthMs/i);
  assert.deepEqual(reverb.setParameters({ modulationRateHz: 0.7, modulationDepthMs: 1.2 }), {
    roomSize: 0.72, damping: 0.35, mix: 0, width: 0.8, preDelayMs: 0, earlyLevel: 0.65,
    modulationRateHz: 0.7, modulationDepthMs: 1.2,
  });
});

test('tail modulation remains finite and bounded during a long maximum-room impulse', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0.98, damping: 0.05, modulationRateHz: 0.8, modulationDepthMs: 1.5 });
  const left = new Float32Array(80000);
  const right = new Float32Array(80000);
  left[0] = 1;
  reverb.process(left, right);
  assert.ok([...left, ...right].every(Number.isFinite));
  assert.ok(Math.max(...left.map(Math.abs)) < 1);
  assert.ok(Math.max(...right.map(Math.abs)) < 1);
});

test('zero modulation depth preserves a deterministic unmodulated response', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, modulationRateHz: 1.2, modulationDepthMs: 0 });
  const left = new Float32Array(4096);
  const right = new Float32Array(4096);
  left[0] = 1;
  reverb.process(left, right);
  assert.ok([...left, ...right].every(Number.isFinite));
  const first = left.slice();
  reverb.reset();
  const second = new Float32Array(4096);
  const secondRight = new Float32Array(4096);
  second[0] = 1;
  reverb.process(second, secondRight);
  assert.deepEqual(second, first);
});


test('tail modulation changes diffusion over time without block-boundary phase resets', () => {
  const render = (split) => {
    const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0.8, modulationRateHz: 0.7, modulationDepthMs: 1.4 });
    const left = new Float32Array(16000);
    const right = new Float32Array(16000);
    left[0] = 1;
    if (split) {
      reverb.process(left.subarray(0, 4096), right.subarray(0, 4096));
      reverb.process(left.subarray(4096, 8192), right.subarray(4096, 8192));
      reverb.process(left.subarray(8192), right.subarray(8192));
    } else reverb.process(left, right);
    return [left, right];
  };
  const whole = render(false);
  const split = render(true);
  assert.deepEqual(split[0], whole[0]);
  assert.deepEqual(split[1], whole[1]);
});

test('enabled tail modulation measurably changes the diffuse response from the neutral mode', () => {
  const render = (depth) => {
    const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0.8, modulationRateHz: 0.7, modulationDepthMs: depth });
    const left = new Float32Array(16000);
    const right = new Float32Array(16000);
    left[0] = 1;
    reverb.process(left, right);
    return left;
  };
  const neutral = render(0);
  const modulated = render(1.4);
  let difference = 0;
  for (let i = 0; i < neutral.length; i += 1) difference += Math.abs(neutral[i] - modulated[i]);
  assert.ok(difference > 0.01, `modulation difference too small: ${difference}`);
});

test('bypassed reverb keeps feeding its network and releases the stored tail after re-enable', () => {
  const reverb = new StereoReverb({ sampleRate: 8000, mix: 1, roomSize: 0.7 });
  const inputL = new Float32Array(4096);
  const inputR = new Float32Array(4096);
  inputL[0] = 1;
  const expectedL = inputL.slice();
  reverb.process(inputL, inputR, { bypass: true });
  assert.deepEqual(inputL, expectedL);
  const nextL = new Float32Array(4096);
  const nextR = new Float32Array(4096);
  reverb.process(nextL, nextR);
  assert.ok(nextL.some((sample) => Math.abs(sample) > 1e-6));
});
