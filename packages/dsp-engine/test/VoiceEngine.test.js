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
  const engine = createEngine();
  addVoice(engine, {
    envelope: { attack: 0.0005, decay: 0.0005, sustain: 0.5, release: 0.01 },
  });
  render(engine, 4);
  assert.equal(engine.getVoice('voice-1').stage, 'decay');
  assert.equal(engine.getVoice('voice-1').envelopeLevel, 1);
  render(engine, 4);
  assert.equal(engine.getVoice('voice-1').stage, 'sustain');
  assert.equal(engine.getVoice('voice-1').envelopeLevel, 0.5);
});

test('noteOff releases a voice and removes it after the release duration', () => {
  const engine = createEngine();
  addVoice(engine, { envelope: { attack: 0, decay: 0, sustain: 1, release: 0.0005 } });
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


function spectralAmplitudeAtBin(samples, bin) {
  let real = 0;
  let imaginary = 0;
  const angularStep = (2 * Math.PI * bin) / samples.length;
  for (let index = 0; index < samples.length; index++) {
    const angle = angularStep * index;
    real += samples[index] * Math.cos(angle);
    imaginary -= samples[index] * Math.sin(angle);
  }
  return (2 * Math.hypot(real, imaginary)) / samples.length;
}

function renderSteadyVoice({ waveform, frequency, sampleRate, length, voiceGain = 1 }) {
  const engine = new VoiceEngine({ sampleRate, maxVoices: 1, voiceGain });
  engine.noteOn({
    id: 'spectral-voice',
    note: 69,
    frequency,
    velocity: 1,
    waveform,
    envelope: { attack: 0, decay: 0, sustain: 1, release: 0 },
  });
  const output = new Float32Array(length);
  engine.render(output);
  return output;
}

test('sine oscillator has the expected coherent fundamental and low harmonic residue', () => {
  const sampleRate = 48000;
  const frequency = 997;
  const length = sampleRate;
  const samples = renderSteadyVoice({ waveform: 'sine', frequency, sampleRate, length });
  const fundamentalBin = frequency;
  const fundamental = spectralAmplitudeAtBin(samples, fundamentalBin);
  const secondHarmonic = spectralAmplitudeAtBin(samples, fundamentalBin * 2);
  const thirdHarmonic = spectralAmplitudeAtBin(samples, fundamentalBin * 3);

  assert.ok(Math.abs(fundamental - 1) < 1e-5, 'sine fundamental amplitude should be approximately unity');
  assert.ok(secondHarmonic < 1e-5, 'sine second harmonic should be negligible');
  assert.ok(thirdHarmonic < 1e-5, 'sine third harmonic should be negligible');
});

test('PolyBLEP saw reduces a folded upper-harmonic component versus a naive saw', () => {
  const sampleRate = 48000;
  const frequency = 6000;
  const length = 4800;
  const corrected = renderSteadyVoice({ waveform: 'saw', frequency, sampleRate, length });

  const naive = new Float32Array(length);
  let phase = 0;
  const increment = frequency / sampleRate;
  for (let index = 0; index < length; index++) {
    naive[index] = (2 * phase) - 1;
    phase += increment;
    if (phase >= 1) phase -= 1;
  }

  const probeBin = 1800;
  const correctedProbe = spectralAmplitudeAtBin(corrected, probeBin);
  const naiveProbe = spectralAmplitudeAtBin(naive, probeBin);

  assert.ok(naiveProbe > 0.2, 'naive saw reference should expose the expected folded component');
  assert.ok(
    correctedProbe < naiveProbe * 0.5,
    `PolyBLEP probe (${correctedProbe}) should be less than half the naive reference (${naiveProbe})`,
  );
});


test('PolyBLEP suppresses aliased third-harmonic energy for saw and square at multiple sample rates', () => {
  for (const sampleRate of [44100, 48000]) {
    const frequency = sampleRate * 0.18;
    const length = 5000;
    const fundamentalBin = Math.round((frequency * length) / sampleRate);
    const thirdHarmonicAliasBin = length - (3 * fundamentalBin);

    for (const waveform of ['saw', 'square']) {
      const corrected = renderSteadyVoice({ waveform, frequency, sampleRate, length });
      const naive = new Float32Array(length);
      let phase = 0;
      const increment = frequency / sampleRate;
      for (let index = 0; index < length; index++) {
        naive[index] = waveform === 'saw' ? (2 * phase) - 1 : (phase < 0.5 ? 1 : -1);
        phase += increment;
        if (phase >= 1) phase -= 1;
      }

      const correctedAlias = spectralAmplitudeAtBin(corrected, thirdHarmonicAliasBin);
      const naiveAlias = spectralAmplitudeAtBin(naive, thirdHarmonicAliasBin);
      assert.ok(naiveAlias > 0.1, waveform + ' naive reference should expose alias energy');
      assert.ok(
        correctedAlias < naiveAlias * 0.45,
        waveform + ' PolyBLEP alias should be below 45% of naive at ' + sampleRate + ' Hz',
      );
    }
  }
});


test('Virtual Analog parameters set defaults for new voices and master level for rendering', () => {
  const engine = createEngine({ voiceGain: 1 });
  const parameters = engine.setParameters({
    'global.master-level': 0.25,
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.amp-attack': 0,
    'engine.virtual-analog.amp-decay': 0,
    'engine.virtual-analog.amp-sustain': 1,
    'engine.virtual-analog.amp-release': 0.01,
  });
  assert.equal(parameters['engine.virtual-analog.osc-wave'], 'sine');
  engine.noteOn({ id: 'parameter-voice', note: 69, frequency: 440 });
  assert.equal(engine.getVoice('parameter-voice').waveform, 'sine');
  assert.equal(engine.getVoice('parameter-voice').envelope.sustain, 1);
  const output = new Float32Array(256);
  engine.render(output);
  assert.ok(Math.max(...output.map(Math.abs)) <= 0.251);
  assert.throws(() => engine.setParameters({ 'global.master-level': 1.5 }), /range/i);
  assert.equal(engine.getParameters()['global.master-level'], 0.25);
});


test('Virtual Analog filter parameters update active voices in the live render path', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.amp-attack': 0,
    'engine.virtual-analog.amp-decay': 0,
    'engine.virtual-analog.amp-sustain': 1,
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 500,
    'engine.virtual-analog.filter-resonance': 0.707,
  });
  addVoice(engine, { id: 'filter-live', frequency: 6000, waveform: 'sine' });
  const before = engine.getVoice('filter-live').filter;
  assert.equal(before.mode, 'lowpass');
  assert.equal(before.cutoff, 500);
  engine.setParameters({
    'engine.virtual-analog.filter-mode': 'highpass',
    'engine.virtual-analog.filter-cutoff': 2500,
  });
  const after = engine.getVoice('filter-live').filter;
  assert.equal(after.mode, 'highpass');
  assert.equal(after.cutoff, 2500);
  const output = new Float32Array(2048);
  engine.render(output);
  assert.ok([...output].every(Number.isFinite));
  assert.ok(output.some((sample) => sample !== 0));
});

test('each voice owns independent filter integrator state', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.amp-attack': 0,
    'engine.virtual-analog.amp-decay': 0,
    'engine.virtual-analog.amp-sustain': 1,
    'engine.virtual-analog.filter-mode': 'lowpass',
  });
  addVoice(engine, { id: 'filter-a', note: 60, frequency: 261.63 });
  addVoice(engine, { id: 'filter-b', note: 64, frequency: 329.63 });
  const output = new Float32Array(128);
  engine.render(output);
  const a = engine.getVoice('filter-a').filterState;
  const b = engine.getVoice('filter-b').filterState;
  assert.notDeepEqual(a, b);
});
