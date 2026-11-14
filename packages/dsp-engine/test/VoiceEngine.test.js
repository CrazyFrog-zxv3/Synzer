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
  addVoice(engine, { id: 'filter-live', frequency: 3000, waveform: 'sine' });
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


test('filter envelope opens the cutoff by its positive semitone depth and releases to base', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.amp-attack': 0,
    'engine.virtual-analog.amp-decay': 0,
    'engine.virtual-analog.amp-sustain': 1,
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 500,
    'engine.virtual-analog.filter-env-attack': 0.0005,
    'engine.virtual-analog.filter-env-decay': 0,
    'engine.virtual-analog.filter-env-sustain': 1,
    'engine.virtual-analog.filter-env-release': 0.0005,
    'engine.virtual-analog.filter-env-amount': 24,
  });
  addVoice(engine, { id: 'filter-env-positive', frequency: 220 });
  render(engine, 4);
  const opened = engine.getVoice('filter-env-positive');
  assert.equal(opened.filterEnvelope.stage, 'sustain');
  assert.equal(opened.filterEnvelope.level, 1);
  assert.ok(Math.abs(opened.filter.cutoff - 2000) < 1, 'two octaves should multiply cutoff by four');
  assert.equal(engine.noteOff('filter-env-positive'), true);
  render(engine, 4);
  const released = engine.getVoice('filter-env-positive');
  assert.equal(released.filterEnvelope.level, 0);
  assert.ok(Math.abs(released.filter.cutoff - 500) < 1, 'release should return cutoff to its base value');
});

test('negative filter-envelope depth closes the cutoff by the requested semitones', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 2000,
    'engine.virtual-analog.filter-env-attack': 0,
    'engine.virtual-analog.filter-env-decay': 0,
    'engine.virtual-analog.filter-env-sustain': 1,
    'engine.virtual-analog.filter-env-amount': -24,
  });
  addVoice(engine, { id: 'filter-env-negative', frequency: 220 });
  render(engine, 2);
  assert.ok(Math.abs(engine.getVoice('filter-env-negative').filter.cutoff - 500) < 1);
});

test('filter-envelope defaults are neutral and its parameter updates affect active voices', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 1200,
    'engine.virtual-analog.filter-env-attack': 0,
    'engine.virtual-analog.filter-env-decay': 0,
    'engine.virtual-analog.filter-env-sustain': 1,
  });
  addVoice(engine, { id: 'filter-env-live' });
  render(engine, 1);
  assert.equal(engine.getVoice('filter-env-live').filter.cutoff, 1200);
  engine.setParameters({ 'engine.virtual-analog.filter-env-amount': 12 });
  render(engine, 1);
  assert.ok(Math.abs(engine.getVoice('filter-env-live').filter.cutoff - 2400) < 1);
});

test('filter-envelope state returned by getVoice is a defensive snapshot', () => {
  const engine = createEngine();
  addVoice(engine);
  const snapshot = engine.getVoice('voice-1');
  snapshot.filterEnvelope.level = 1;
  snapshot.filterEnvelope.amount = 48;
  assert.equal(engine.getVoice('voice-1').filterEnvelope.level, 0);
  assert.equal(engine.getVoice('voice-1').filterEnvelope.amount, 0);
});


test('LFO modulates filter cutoff and crosses from positive to negative polarity', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 1000,
    'engine.virtual-analog.filter-env-amount': 0,
    'engine.virtual-analog.lfo1-rate': 2,
    'engine.virtual-analog.lfo1-waveform': 'square',
    'engine.virtual-analog.lfo1-amount': 12,
  });
  addVoice(engine, { id: 'lfo-filter' });
  render(engine, 1);
  assert.ok(Math.abs(engine.getVoice('lfo-filter').filter.cutoff - 2000) < 1,
    'positive square phase should raise cutoff by one octave');
  render(engine, 2001);
  assert.ok(Math.abs(engine.getVoice('lfo-filter').filter.cutoff - 500) < 1,
    'negative square phase should lower cutoff by one octave');
});

test('LFO parameter changes affect active voices without resetting phase', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 1000,
    'engine.virtual-analog.filter-env-amount': 0,
    'engine.virtual-analog.lfo1-rate': 1,
    'engine.virtual-analog.lfo1-waveform': 'sine',
    'engine.virtual-analog.lfo1-amount': 0,
  });
  addVoice(engine, { id: 'lfo-live' });
  render(engine, 100);
  const before = engine.getVoice('lfo-live').lfo.phase;
  engine.setParameters({ 'engine.virtual-analog.lfo1-amount': 12 });
  const after = engine.getVoice('lfo-live').lfo.phase;
  assert.equal(after, before);
  render(engine, 1);
  assert.ok(engine.getVoice('lfo-live').filter.cutoff > 1000);
});

test('each voice owns an independent retriggered LFO phase', () => {
  const engine = createEngine();
  engine.setParameters({ 'engine.virtual-analog.lfo1-rate': 3 });
  addVoice(engine, { id: 'lfo-a' });
  render(engine, 32);
  addVoice(engine, { id: 'lfo-b', note: 64, frequency: 329.63 });
  assert.equal(engine.getVoice('lfo-b').lfo.phase, 0);
  assert.notEqual(engine.getVoice('lfo-a').lfo.phase, engine.getVoice('lfo-b').lfo.phase);
});


test('modulation matrix independently enables or disables EG and LFO routes to filter cutoff', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.filter-mode': 'lowpass',
    'engine.virtual-analog.filter-cutoff': 1000,
    'engine.virtual-analog.filter-env-attack': 0,
    'engine.virtual-analog.filter-env-decay': 0,
    'engine.virtual-analog.filter-env-sustain': 1,
    'engine.virtual-analog.filter-env-amount': 12,
    'engine.virtual-analog.filter-env-route-enabled': false,
    'engine.virtual-analog.lfo1-rate': 2,
    'engine.virtual-analog.lfo1-waveform': 'square',
    'engine.virtual-analog.lfo1-amount': 12,
    'engine.virtual-analog.lfo1-route-enabled': true,
  });
  addVoice(engine, { id: 'matrix-routes' });
  render(engine, 1);
  assert.ok(Math.abs(engine.getVoice('matrix-routes').filter.cutoff - 2000) < 1,
    'only the enabled LFO route should contribute');
  engine.setParameters({
    'engine.virtual-analog.filter-env-route-enabled': true,
    'engine.virtual-analog.lfo1-route-enabled': false,
  });
  render(engine, 1);
  assert.ok(Math.abs(engine.getVoice('matrix-routes').filter.cutoff - 2000) < 1,
    'only the enabled filter-envelope route should contribute');
  engine.setParameters({
    'engine.virtual-analog.filter-env-route-enabled': false,
    'engine.virtual-analog.lfo1-route-enabled': false,
  });
  render(engine, 1);
  assert.ok(Math.abs(engine.getVoice('matrix-routes').filter.cutoff - 1000) < 1,
    'disabling all routes must restore the unmodulated base cutoff');
});


test('second oscillator is disabled by default and preserves the original single-oscillator signal', () => {
  const baseline = createEngine({ voiceGain: 1 });
  const candidate = createEngine({ voiceGain: 1 });
  addVoice(baseline, { waveform: 'sine', frequency: 440, id: 'baseline' });
  addVoice(candidate, { waveform: 'sine', frequency: 440, id: 'candidate' });
  assert.equal(candidate.getVoice('candidate').oscillator2.enabled, false);
  assert.deepEqual(render(candidate, 512).left, render(baseline, 512).left);
});

test('second oscillator supports independent waveform, octave and level in the live render path', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.amp-attack': 0,
    'engine.virtual-analog.amp-decay': 0,
    'engine.virtual-analog.amp-sustain': 1,
    'engine.virtual-analog.osc2-enabled': true,
    'engine.virtual-analog.osc2-wave': 'square',
    'engine.virtual-analog.osc2-level': 0.5,
    'engine.virtual-analog.osc2-octave': 1,
    'engine.virtual-analog.osc2-semitone': 0,
    'engine.virtual-analog.osc2-fine': 0,
  });
  addVoice(engine, { id: 'osc2-live', frequency: 440, waveform: 'sine' });
  const voice = engine.getVoice('osc2-live');
  assert.equal(voice.oscillator2.enabled, true);
  assert.equal(voice.oscillator2.waveform, 'square');
  assert.equal(voice.oscillator2.frequency, 880);
  assert.equal(voice.oscillator2.level, 0.5);
  const output = render(engine, 2048).left;
  assert.ok([...output].every(Number.isFinite));
  assert.ok(output.some((sample) => sample !== 0));
  assert.ok(Math.max(...output.map(Math.abs)) <= 1.001);
});

test('second oscillator phase advances while disabled and live changes preserve its phase', () => {
  const engine = createEngine();
  addVoice(engine, { id: 'osc2-phase', frequency: 440 });
  render(engine, 100);
  const phase = engine.getVoice('osc2-phase').oscillator2.phase;
  assert.ok(phase > 0);
  engine.setParameters({
    'engine.virtual-analog.osc2-enabled': true,
    'engine.virtual-analog.osc2-wave': 'saw',
    'engine.virtual-analog.osc2-octave': 1,
  });
  const updated = engine.getVoice('osc2-phase').oscillator2;
  assert.equal(updated.phase, phase);
  assert.equal(updated.frequency, 880);
  assert.equal(updated.enabled, true);
});


test('modulation matrix applies EG and LFO pitch routes independently to OSC 01 and OSC 02', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.osc-wave': 'sine',
    'engine.virtual-analog.osc2-enabled': true,
    'engine.virtual-analog.osc2-wave': 'sine',
    'engine.virtual-analog.osc2-octave': 0,
    'engine.virtual-analog.filter-env-attack': 0,
    'engine.virtual-analog.filter-env-decay': 0,
    'engine.virtual-analog.filter-env-sustain': 1,
    'engine.virtual-analog.lfo1-waveform': 'square',
    'engine.virtual-analog.lfo1-rate': 0.05,
    'engine.virtual-analog.eg-osc1-pitch-amount': 12,
    'engine.virtual-analog.eg-osc1-pitch-enabled': true,
    'engine.virtual-analog.lfo-osc1-pitch-amount': 5,
    'engine.virtual-analog.lfo-osc1-pitch-enabled': true,
    'engine.virtual-analog.eg-osc2-pitch-amount': -5,
    'engine.virtual-analog.eg-osc2-pitch-enabled': true,
    'engine.virtual-analog.lfo-osc2-pitch-amount': 7,
    'engine.virtual-analog.lfo-osc2-pitch-enabled': true,
  });
  addVoice(engine, { id: 'pitch-routes', frequency: 440, waveform: 'sine' });
  render(engine, 1);
  const voice = engine.getVoice('pitch-routes');
  const expectedOsc1 = (440 * (2 ** (17 / 12))) / engine.sampleRate;
  const expectedOsc2 = (440 * (2 ** (2 / 12))) / engine.sampleRate;
  assert.ok(Math.abs(voice.phase - expectedOsc1) < 1e-9, `OSC 01 phase ${voice.phase} should combine EG and LFO pitch modulation`);
  assert.ok(Math.abs(voice.oscillator2.phase - expectedOsc2) < 1e-9, `OSC 02 phase ${voice.oscillator2.phase} should combine EG and LFO pitch modulation`);
  assert.ok([...render(engine, 128).left].every(Number.isFinite));
});

test('pitch modulation routes default to neutral and can be disabled independently', () => {
  const baseline = createEngine({ voiceGain: 1 });
  const candidate = createEngine({ voiceGain: 1 });
  candidate.setParameters({
    'engine.virtual-analog.lfo1-waveform': 'square',
    'engine.virtual-analog.lfo-osc1-pitch-amount': 12,
    'engine.virtual-analog.lfo-osc1-pitch-enabled': false,
  });
  addVoice(baseline, { id: 'pitch-base', frequency: 440, waveform: 'sine' });
  addVoice(candidate, { id: 'pitch-off', frequency: 440, waveform: 'sine' });
  assert.deepEqual(render(candidate, 256).left, render(baseline, 256).left);
});

test('EG 03 independently modulates oscillator pitch and owns its ADSR state', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.pitch-env-attack': 0,
    'engine.virtual-analog.pitch-env-decay': 0,
    'engine.virtual-analog.pitch-env-sustain': 1,
    'engine.virtual-analog.pitch-env-release': 0.001,
    'engine.virtual-analog.pitch-env-osc1-amount': 12,
    'engine.virtual-analog.pitch-env-osc1-enabled': true,
    'engine.virtual-analog.pitch-env-osc2-amount': -12,
    'engine.virtual-analog.pitch-env-osc2-enabled': true,
    'engine.virtual-analog.osc2-enabled': true,
  });
  addVoice(engine, { id: 'eg03', frequency: 440, waveform: 'sine' });
  render(engine, 1);
  const voice = engine.getVoice('eg03');
  assert.equal(voice.pitchEnvelope.stage, 'sustain');
  assert.equal(voice.pitchEnvelope.level, 1);
  assert.ok(Math.abs(voice.phase - ((440 * 2) / engine.sampleRate)) < 1e-9);
  assert.ok(Math.abs(voice.oscillator2.phase - ((440 * 0.5) / engine.sampleRate)) < 1e-9);
});

test('EG 03 release is independent from the amplitude envelope', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.pitch-env-attack': 0,
    'engine.virtual-analog.pitch-env-decay': 0,
    'engine.virtual-analog.pitch-env-sustain': 1,
    'engine.virtual-analog.pitch-env-release': 0.001,
    'engine.virtual-analog.pitch-env-osc1-amount': 12,
  });
  addVoice(engine, { id: 'eg03-release', envelope: { attack: 0, decay: 0, sustain: 1, release: 0.02 } });
  render(engine, 1);
  assert.equal(engine.noteOff('eg03-release'), true);
  assert.equal(engine.getVoice('eg03-release').pitchEnvelope.stage, 'release');
  render(engine, 8);
  assert.equal(engine.getVoice('eg03-release').pitchEnvelope.stage, 'idle');
  assert.equal(engine.getVoice('eg03-release').envelopeLevel > 0, true);
});

test('EG 03 defaults to a sonically neutral route', () => {
  const baseline = createEngine({ voiceGain: 1 });
  const candidate = createEngine({ voiceGain: 1 });
  candidate.setParameters({
    'engine.virtual-analog.pitch-env-attack': 0,
    'engine.virtual-analog.pitch-env-decay': 0,
    'engine.virtual-analog.pitch-env-sustain': 1,
    'engine.virtual-analog.pitch-env-release': 0.5,
  });
  addVoice(baseline, { id: 'eg03-neutral-base', frequency: 440, waveform: 'sine' });
  addVoice(candidate, { id: 'eg03-neutral-candidate', frequency: 440, waveform: 'sine' });
  assert.deepEqual(render(candidate, 512).left, render(baseline, 512).left);
});

test('live EG 03 parameter updates preserve the active envelope stage and level', () => {
  const engine = createEngine();
  engine.setParameters({
    'engine.virtual-analog.pitch-env-attack': 0.1,
    'engine.virtual-analog.pitch-env-decay': 0.2,
    'engine.virtual-analog.pitch-env-sustain': 0.4,
  });
  addVoice(engine, { id: 'eg03-live' });
  render(engine, 40);
  const before = engine.getVoice('eg03-live').pitchEnvelope;
  engine.setParameters({
    'engine.virtual-analog.pitch-env-attack': 0.2,
    'engine.virtual-analog.pitch-env-decay': 0.3,
    'engine.virtual-analog.pitch-env-sustain': 0.6,
  });
  const after = engine.getVoice('eg03-live').pitchEnvelope;
  assert.equal(after.stage, before.stage);
  assert.equal(after.level, before.level);
  assert.equal(after.stageSamples, before.stageSamples);
});

test('EG 03 state snapshots are defensive', () => {
  const engine = createEngine();
  addVoice(engine, { id: 'eg03-snapshot' });
  const snapshot = engine.getVoice('eg03-snapshot');
  snapshot.pitchEnvelope.level = 1;
  snapshot.pitchEnvelope.amount = 48;
  assert.equal(engine.getVoice('eg03-snapshot').pitchEnvelope.level, 0);
  assert.equal(engine.getVoice('eg03-snapshot').pitchEnvelope.amount, undefined);
});


test('noise generator adds deterministic white noise per voice before the shared filter and amp envelope', () => {
  const a = createEngine({ voiceGain: 1 });
  const b = createEngine({ voiceGain: 1 });
  const parameters = {
    'engine.virtual-analog.noise-enabled': true,
    'engine.virtual-analog.noise-color': 'white',
    'engine.virtual-analog.noise-level': 1,
    'engine.virtual-analog.amp-attack': 0,
    'engine.virtual-analog.amp-decay': 0,
    'engine.virtual-analog.amp-sustain': 1,
  };
  a.setParameters(parameters);
  b.setParameters(parameters);
  addVoice(a, { id: 'noise-a', frequency: 440, waveform: 'sine' });
  addVoice(b, { id: 'noise-b', frequency: 440, waveform: 'sine' });
  const outputA = render(a, 512).left;
  const outputB = render(b, 512).left;
  assert.deepEqual(outputA, outputB);
  assert.ok(outputA.some((sample) => sample !== 0));
  assert.ok([...outputA].every(Number.isFinite));
  assert.equal(a.getVoice('noise-a').noise.enabled, true);
  assert.equal(a.getVoice('noise-a').noise.color, 'white');
});

test('pink noise is independent per voice and color changes preserve generator state', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.noise-enabled': true,
    'engine.virtual-analog.noise-color': 'pink',
    'engine.virtual-analog.noise-level': 0.5,
  });
  addVoice(engine, { id: 'pink-a', frequency: 440, waveform: 'sine' });
  addVoice(engine, { id: 'pink-b', frequency: 440, waveform: 'sine' });
  const first = render(engine, 1024).left;
  assert.ok(first.every(Number.isFinite));
  assert.ok(first.some((sample) => sample !== 0));
  engine.setParameters({ 'engine.virtual-analog.noise-color': 'white' });
  assert.equal(engine.getVoice('pink-a').noise.color, 'white');
  assert.equal(engine.getVoice('pink-a').noise.level, 0.5);
});

test('disabled noise preserves the previous oscillator signal bit-for-bit', () => {
  const baseline = createEngine({ voiceGain: 1 });
  const candidate = createEngine({ voiceGain: 1 });
  candidate.setParameters({
    'engine.virtual-analog.noise-enabled': false,
    'engine.virtual-analog.noise-color': 'pink',
    'engine.virtual-analog.noise-level': 1,
  });
  addVoice(baseline, { id: 'noise-off-base', frequency: 440, waveform: 'sine' });
  addVoice(candidate, { id: 'noise-off-candidate', frequency: 440, waveform: 'sine' });
  assert.deepEqual(render(candidate, 512).left, render(baseline, 512).left);
});

test('unison defaults to one oscillator lane and preserves the original signal', () => {
  const baseline = createEngine({ voiceGain: 1 });
  const candidate = createEngine({ voiceGain: 1 });
  candidate.setParameters({ 'engine.virtual-analog.unison-voices': 1, 'engine.virtual-analog.unison-detune': 24 });
  addVoice(baseline, { id: 'unison-base', frequency: 440, waveform: 'sine' });
  addVoice(candidate, { id: 'unison-one', frequency: 440, waveform: 'sine' });
  assert.deepEqual(render(candidate, 512).left, render(baseline, 512).left);
  assert.equal(candidate.getVoice('unison-one').unison.voices, 1);
});

test('unison creates symmetric detuned phase lanes for both oscillators', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.osc2-enabled': true,
    'engine.virtual-analog.unison-voices': 4,
    'engine.virtual-analog.unison-detune': 12,
  });
  addVoice(engine, { id: 'unison-four', frequency: 440, waveform: 'sine' });
  render(engine, 1);
  const voice = engine.getVoice('unison-four');
  const offsets = [-12, -4, 4, 12];
  assert.equal(voice.unison.voices, 4);
  assert.deepEqual(voice.unison.oscillator1Phases.map((phase) => phase * engine.sampleRate),
    offsets.map((cents) => 440 * (2 ** (cents / 1200))));
  assert.deepEqual(voice.unison.oscillator2Phases.map((phase) => phase * engine.sampleRate),
    offsets.map((cents) => 440 * (2 ** (cents / 1200))));
  assert.equal(voice.phase, voice.unison.oscillator1Phases[0]);
  assert.equal(voice.oscillator2.phase, voice.unison.oscillator2Phases[0]);
});

test('live unison changes preserve the primary phase and initialize added lanes continuously', () => {
  const engine = createEngine({ voiceGain: 1 });
  addVoice(engine, { id: 'unison-live', frequency: 440, waveform: 'sine' });
  render(engine, 64);
  const before = engine.getVoice('unison-live').phase;
  engine.setParameters({ 'engine.virtual-analog.unison-voices': 3, 'engine.virtual-analog.unison-detune': 8 });
  const updated = engine.getVoice('unison-live');
  assert.equal(updated.phase, before);
  assert.equal(updated.unison.oscillator1Phases.length, 3);
  assert.ok(updated.unison.oscillator1Phases.every((phase) => phase === before));
  render(engine, 1);
  const after = engine.getVoice('unison-live');
  assert.equal(after.phase, after.unison.oscillator1Phases[0]);
  assert.notEqual(after.unison.oscillator1Phases[0], after.unison.oscillator1Phases[2]);
});

test('unison with zero detune sums coherently and remains finite', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({ 'engine.virtual-analog.unison-voices': 4, 'engine.virtual-analog.unison-detune': 0 });
  addVoice(engine, { id: 'unison-zero-detune', frequency: 440, waveform: 'sine' });
  const output = render(engine, 512).left;
  assert.ok([...output].every(Number.isFinite));
  assert.ok(output.some((sample) => sample !== 0));
});


test('live unison detune changes preserve every active phase lane', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({ 'engine.virtual-analog.unison-voices': 4, 'engine.virtual-analog.unison-detune': 8 });
  addVoice(engine, { id: 'unison-detune-live', frequency: 440, waveform: 'sine' });
  render(engine, 96);
  const before = engine.getVoice('unison-detune-live').unison;
  engine.setParameters({ 'engine.virtual-analog.unison-detune': 24 });
  const after = engine.getVoice('unison-detune-live').unison;
  assert.deepEqual(after.oscillator1Phases, before.oscillator1Phases);
  assert.deepEqual(after.oscillator2Phases, before.oscillator2Phases);
  assert.equal(after.detune, 24);
});

test('sub oscillator defaults off and preserves the previous signal bit-for-bit', () => {
  const baseline = createEngine({ voiceGain: 1 });
  const candidate = createEngine({ voiceGain: 1 });
  addVoice(baseline, { id: 'sub-base', frequency: 440, waveform: 'sine' });
  addVoice(candidate, { id: 'sub-candidate', frequency: 440, waveform: 'sine' });
  assert.deepEqual(render(candidate, 512).left, render(baseline, 512).left);
  assert.equal(candidate.getVoice('sub-candidate').sub.enabled, false);
});

test('sub oscillator tracks the note one or two octaves below with an independent phase', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({
    'engine.virtual-analog.sub-enabled': true,
    'engine.virtual-analog.sub-wave': 'square',
    'engine.virtual-analog.sub-level': 0.35,
    'engine.virtual-analog.sub-octave': -1,
  });
  addVoice(engine, { id: 'sub-octave', frequency: 440, waveform: 'sine' });
  const before = engine.getVoice('sub-octave').sub;
  assert.equal(before.frequency, 220);
  assert.equal(before.phase, 0);
  render(engine, 128);
  const after = engine.getVoice('sub-octave').sub;
  assert.notEqual(after.phase, before.phase);
  assert.ok(Number.isFinite(after.phaseIncrement));
  assert.ok(after.phaseIncrement > 0);
});

test('live sub oscillator updates preserve phase while changing waveform, level and octave', () => {
  const engine = createEngine({ voiceGain: 1 });
  engine.setParameters({ 'engine.virtual-analog.sub-enabled': true });
  addVoice(engine, { id: 'sub-live', frequency: 440, waveform: 'sine' });
  render(engine, 64);
  const phase = engine.getVoice('sub-live').sub.phase;
  engine.setParameters({
    'engine.virtual-analog.sub-wave': 'saw',
    'engine.virtual-analog.sub-level': 0.6,
    'engine.virtual-analog.sub-octave': -2,
  });
  const updated = engine.getVoice('sub-live').sub;
  assert.equal(updated.phase, phase);
  assert.equal(updated.frequency, 110);
  assert.equal(updated.waveform, 'saw');
  assert.equal(updated.level, 0.6);
});
