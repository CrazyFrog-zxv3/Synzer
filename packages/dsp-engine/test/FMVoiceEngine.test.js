import test from 'node:test';
import assert from 'node:assert/strict';
import { FMVoiceEngine } from '../src/core/FMVoiceEngine.js';

test('four-operator FM renders finite stereo audio with a non-zero carrier', () => {
  const engine = new FMVoiceEngine({ sampleRate: 48000, maxVoices: 4 });
  engine.noteOn({ id: 'fm-a', note: 69, frequency: 440, velocity: 0.8 });
  const left = new Float32Array(512);
  const right = new Float32Array(512);
  engine.render(left, right);
  assert.ok(left.some((sample) => Math.abs(sample) > 1e-5));
  assert.deepEqual(right, left);
  assert.ok([...left, ...right].every(Number.isFinite));
});

test('FM algorithms and operator parameters change the rendered spectrum without phase reset', () => {
  const engine = new FMVoiceEngine({ sampleRate: 48000, maxVoices: 2 });
  engine.noteOn({ id: 'fm-b', note: 60, frequency: 261.6256, velocity: 1 });
  const first = new Float32Array(256);
  engine.render(first, first);
  const phase = engine.getVoice('fm-b').phases[0];
  engine.setParameters({ 'engine.fm.algorithm': 3, 'engine.fm.op2-ratio': 2.5, 'engine.fm.op2-index': 9 });
  assert.equal(engine.getVoice('fm-b').phases[0], phase);
  const second = new Float32Array(256);
  engine.render(second, second);
  assert.notDeepEqual(second, first);
});

test('FM operator envelopes release and voices are removed after their tail', () => {
  const engine = new FMVoiceEngine({ sampleRate: 8000, maxVoices: 2 });
  engine.setParameters(Object.fromEntries([1, 2, 3, 4].flatMap((op) => [[`engine.fm.op${op}-attack`, 0], [`engine.fm.op${op}-decay`, 0], [`engine.fm.op${op}-sustain`, 1], [`engine.fm.op${op}-release`, 0.01]])));
  engine.noteOn({ id: 'fm-c', note: 69, frequency: 440, velocity: 1 });
  engine.noteOff('fm-c');
  const left = new Float32Array(256);
  engine.render(left, left);
  assert.equal(engine.getVoice('fm-c'), null);
  assert.throws(() => engine.setParameters({ 'engine.fm.op1-ratio': 0 }), /range/i);
});

test('FM supports twelve simultaneous notes and deterministic voice stealing at the configured ceiling', () => {
  const engine = new FMVoiceEngine({ sampleRate: 48000, maxVoices: 12 });
  for (let index = 0; index < 12; index++) {
    const note = 48 + index;
    engine.noteOn({ id: `poly-${index}`, note, frequency: 440 * (2 ** ((note - 69) / 12)), velocity: 0.75 });
  }
  assert.equal(engine.voices.size, 12);
  engine.noteOn({ id: 'poly-newest', note: 72, frequency: 523.251, velocity: 1 });
  assert.equal(engine.voices.size, 12);
  assert.equal(engine.getVoice('poly-0'), null);
  assert.ok(engine.getVoice('poly-newest'));
  const left = new Float32Array(128);
  engine.render(left, left);
  assert.ok([...left].every(Number.isFinite));
});

test('operator index changes modulation depth in a routed algorithm without resetting phases', () => {
  const engine = new FMVoiceEngine({ sampleRate: 48000, maxVoices: 1 });
  engine.setParameters({ 'engine.fm.algorithm': 1, 'engine.fm.op2-index': 0 });
  engine.noteOn({ id: 'index-route', note: 60, frequency: 261.6256, velocity: 1 });
  const dry = new Float32Array(512);
  engine.render(dry, dry);
  const phaseBefore = engine.getVoice('index-route').phases[0];
  engine.setParameters({ 'engine.fm.op2-index': 12 });
  assert.equal(engine.getVoice('index-route').phases[0], phaseBefore);
  const modulated = new Float32Array(512);
  engine.render(modulated, modulated);
  assert.notDeepEqual(modulated, dry);
});
