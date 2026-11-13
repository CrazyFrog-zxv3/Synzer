import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceEngine, polyBlep } from '../src/core/VoiceEngine.js';

const SAMPLE_RATE = 8000;
const FAST_ENVELOPE = { attack: 0, decay: 0, sustain: 1, release: 0.001 };

function createEngine(options = {}) {
  return new VoiceEngine({ sampleRate: SAMPLE_RATE, ...options });
}

function addVoice(engine, overrides = {}) {
  return engine.noteOn({
    id: 'voice-1',
    note: 60,
    frequency: 440,
    velocity: 0.8,
    waveform: 'saw',
    envelope: FAST_ENVELOPE,
    ...overrides,
  });
}

function render(engine, length = 128) {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  engine.render(left, right);
  return { left, right };
}

test('polyBlep returns zero outside a valid discontinuity interval', () => {
  assert.equal(polyBlep(0.5, 0), 0);
  assert.equal(polyBlep(0.5, 0.5), 0);
  assert.equal(polyBlep(0.5, 0.01), 0);
});

test('polyBlep remains finite around phase wrap boundaries', () => {
  for (const phase of [0, 1e-9, 0.009, 0.01, 0.99, 0.999999, 1]) {
    assert.ok(Number.isFinite(polyBlep(phase, 0.01)));
  }
});

test('constructor rejects invalid sample rates and capacities', () => {
  assert.throws(() => new VoiceEngine({ sampleRate: 0 }), RangeError);
  assert.throws(() => new VoiceEngine({ sampleRate: SAMPLE_RATE, maxVoices: 0 }), RangeError);
  assert.throws(() => new VoiceEngine({ sampleRate: SAMPLE_RATE, maxStealTails: 33 }), RangeError);
});

test('noteOn validates identifiers, note, frequency, velocity and waveform', () => {
  const engine = createEngine();
  assert.throws(() => engine.noteOn({ id: '', note: 60, frequency: 440 }), TypeError);
  assert.throws(() => engine.noteOn({ id: 'bad-note', note: 128, frequency: 440 }), RangeError);
  assert.throws(() => engine.noteOn({ id: 'bad-frequency', note: 60, frequency: SAMPLE_RATE / 2 }), RangeError);
  assert.throws(() => engine.noteOn({ id: 'bad-velocity', note: 60, frequency: 440, velocity: 1.1 }), RangeError);
  assert.throws(() => engine.noteOn({ id: 'bad-wave', note: 60, frequency: 440, waveform: 'triangle' }), TypeError);
});

test('noteOn rejects duplicate active voice identifiers', () => {
  const engine = createEngine();
  addVoice(engine);
  assert.throws(() => addVoice(engine), /already exists/);
});

test('all supported waveforms render finite stereo samples', () => {
  for (const waveform of ['sine', 'saw', 'square']) {
    const engine = createEngine();
    addVoice(engine, { waveform, id: waveform });
    const { left, right } = render(engine, 512);
    assert.ok(left.some((sample) => sample !== 0), waveform + ' should produce audio');
    assert.deepEqual(right, left);
    assert.ok([...left].every(Number.isFinite));
  }
});

test('render supports a shared mono output buffer', () => {
  const engine = createEngine();
  addVoice(engine);
  const mono = new Float32Array(64);
  assert.doesNotThrow(() => engine.render(mono, mono));
  assert.ok(mono.some((sample) => sample !== 0));
});

test('render rejects invalid or mismatched output buffers', () => {
  const engine = createEngine();
  assert.throws(() => engine.render([], new Float32Array(4)), TypeError);
  assert.throws(() => engine.render(new Float32Array(4), new Float32Array(3)), RangeError);
});

test('zero attack and decay reach sustain without a discontinuous invalid state', () => {
  const engine = createEngine();
  addVoice(engine, { envelope: { attack: 0, decay: 0, sustain: 0.4, release: 0.01 } });
  render(engine, 16);
  assert.equal(engine.getVoice('voice-1').stage, 'sustain');
  assert.equal(engine.getVoice('voice-1').envelopeLevel, 0.4);
});

test('attack and decay advance over the requested sample counts', () => {
  const engine = createEngine({ sampleRate: 1000 });
  addVoice(engine, {
    envelope: { attack: 0.004, decay: 0.004, sustain: 0.5, release: 0.01 },
  });
  render(engine, 4);
  assert.equal(engine.getVoice('voice-1').stage, 'decay');
  assert.equal(engine.getVoice('voice-1').envelopeLevel, 1);
  render(engine, 4);
  assert.equal(engine.getVoice('voice-1').stage, 'sustain');
  assert.equal(engine.getVoice('voice-1').envelopeLevel, 0.5);
});

test('noteOff releases a voice and removes it after the release duration', () => {
  const engine = createEngine({ sampleRate: 1000 });
  addVoice(engine, { envelope: { attack: 0, decay: 0, sustain: 1, release: 0.004 } });
  render(engine, 8);
  assert.equal(engine.noteOff('voice-1'), true);
  assert.equal(engine.getVoice('voice-1').stage, 'release');
  render(engine, 4);
  assert.equal(engine.getVoice('voice-1'), undefined);
  assert.equal(engine.voiceCount, 0);
});

test('noteOff returns false for unknown or already released voices', () => {
  const engine = createEngine();
  assert.equal(engine.noteOff('missing'), false);
  addVoice(engine);
  assert.equal(engine.noteOff('voice-1'), true);
  assert.equal(engine.noteOff('voice-1'), false);
});

test('voice stealing preserves a short fade tail and respects the polyphony cap', () => {
  const engine = createEngine({ maxVoices: 2, maxStealTails: 1, stealFadeSeconds: 0.005 });
  addVoice(engine, { id: 'oldest', note: 60 });
  addVoice(engine, { id: 'newer', note: 62 });
  addVoice(engine, { id: 'newest', note: 64 });
  assert.equal(engine.activeVoiceCount, 2);
  assert.equal(engine.stealTailCount, 1);
  assert.equal(engine.getVoice('oldest').stage, 'steal');
  assert.equal(engine.getVoice('newest').stage, 'attack');
});

test('voice stealing fails safely when all steal-tail slots are occupied', () => {
  const engine = createEngine({ maxVoices: 1, maxStealTails: 0 });
  addVoice(engine, { id: 'only' });
  assert.throws(() => addVoice(engine, { id: 'overflow' }), /Steal-tail capacity reached/);
  assert.equal(engine.activeVoiceCount, 1);
  assert.equal(engine.getVoice('only').stage, 'attack');
});

test('getVoice returns a defensive copy', () => {
  const engine = createEngine();
  addVoice(engine);
  const snapshot = engine.getVoice('voice-1');
  snapshot.envelope.sustain = 0;
  assert.equal(engine.getVoice('voice-1').envelope.sustain, 1);
});

test('render remains finite at high supported frequencies and polyphony', () => {
  const engine = createEngine({ maxVoices: 12 });
  for (let index = 0; index < 12; index++) {
    addVoice(engine, {
      id: 'voice-' + index,
      note: 48 + index,
      frequency: SAMPLE_RATE * 0.45,
      waveform: index % 2 ? 'square' : 'saw',
    });
  }
  const { left, right } = render(engine, 2048);
  assert.ok([...left, ...right].every(Number.isFinite));
  assert.ok(Math.max(...left.map(Math.abs)) <= 12 * 0.8 * 0.075 + 1e-6);
});
