(engine, 4);
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
  assert.ok(Math.abs(voice.phase - expectedOsc1) < 1e-9, `OSC 01 phase ${voice.phase} should use EG pitch modulation`);
  assert.ok(Math.abs(voice.oscillator2.phase - expectedOsc2) < 1e-9, `OSC 02 phase ${voice.oscillator2.phase} should use LFO pitch modulation`);
  assert.ok([...render(engine, 128).left].every(Number.isFinite));
});

test('EG 03 independently modulates oscillator pitch and has its own ADSR state', () => {
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
