import { createDefaultVirtualAnalogParameters, normalizeVirtualAnalogParameters } from './VirtualAnalogParameters.js';
import { TptStateVariableFilter } from './TptStateVariableFilter.js';
import { LfoOscillator } from './LfoOscillator.js';
import { ModulationMatrix } from './ModulationMatrix.js';
import { NoiseGenerator } from './NoiseGenerator.js';
import { createHarmonicWavetableMipBank, WavetableOscillator } from './WavetableOscillator.js';

const WAVETABLE_BANK_CACHE = new Map();
const MAX_WAVETABLE_BANK_CACHE = 12;

function getCachedWavetableBank(config) {
  const size = config.size ?? 2048;
  const cacheKey = JSON.stringify({ size, partials: config.partials ?? null, partialFrames: config.partialFrames ?? null });
  const cached = WAVETABLE_BANK_CACHE.get(cacheKey);
  if (cached) {
    WAVETABLE_BANK_CACHE.delete(cacheKey);
    WAVETABLE_BANK_CACHE.set(cacheKey, cached);
    return cached;
  }
  const bank = createHarmonicWavetableMipBank({
    size,
    ...(config.partials === undefined ? {} : { partials: config.partials }),
    ...(config.partialFrames === undefined ? {} : { partialFrames: config.partialFrames }),
  });
  if (WAVETABLE_BANK_CACHE.size >= MAX_WAVETABLE_BANK_CACHE) {
    WAVETABLE_BANK_CACHE.delete(WAVETABLE_BANK_CACHE.keys().next().value);
  }
  WAVETABLE_BANK_CACHE.set(cacheKey, bank);
  return bank;
}

const DEFAULT_ENVELOPE = Object.freeze({ attack: 0.01, decay: 0.08, sustain: 0.75, release: 0.25 });
const SUPPORTED_WAVEFORMS = new Set(['saw', 'square', 'sine']);

function assertFiniteRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

function oscillatorFrequency2(baseFrequency, parameters, sampleRate) {
  const pitchRatio = 2 ** (parameters.octave + (parameters.semitone / 12) + (parameters.fine / 1200));
  return Math.min(baseFrequency * pitchRatio, sampleRate * 0.45);
}

function renderOscillatorSample(waveform, phase, phaseIncrement) {
  if (waveform === 'sine') return Math.sin(2 * Math.PI * phase);
  if (waveform === 'square') {
    return (phase < 0.5 ? 1 : -1) + polyBlep(phase, phaseIncrement) -
      polyBlep((phase + 0.5) % 1, phaseIncrement);
  }
  return (2 * phase) - 1 - polyBlep(phase, phaseIncrement);
}

function normalizeEnvelope(input = {}) {
  const envelope = { ...DEFAULT_ENVELOPE, ...input };
  assertFiniteRange('attack', envelope.attack, 0, 30);
  assertFiniteRange('decay', envelope.decay, 0, 30);
  assertFiniteRange('sustain', envelope.sustain, 0, 1);
  assertFiniteRange('release', envelope.release, 0, 60);
  return envelope;
}

/** PolyBLEP residual for a discontinuity at phase wrap. dt is cycles/sample. */
export function polyBlep(phase, dt) {
  if (!(dt > 0) || dt >= 0.5) return 0;
  if (phase < dt) {
    const t = phase / dt;
    return t + t - t * t - 1;
  }
  if (phase > 1 - dt) {
    const t = (phase - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/**
 * Deterministic, allocation-light sample renderer shared by tests and AudioWorklet.
 * This is an initial polyphonic Virtual Analog core, not yet a complete synth.
 */
export class VoiceEngine {
  constructor({ sampleRate, maxVoices = 12, maxStealTails = 4, stealFadeSeconds = 0.005, voiceGain = 0.075 } = {}) {
    assertFiniteRange('sampleRate', sampleRate, 8000, 384000);
    assertFiniteRange('maxVoices', maxVoices, 1, 256);
    assertFiniteRange('maxStealTails', maxStealTails, 0, 32);
    assertFiniteRange('stealFadeSeconds', stealFadeSeconds, 0.001, 0.1);
    assertFiniteRange('voiceGain', voiceGain, 0, 1);
    this.sampleRate = sampleRate;
    this.maxVoices = Math.floor(maxVoices);
    this.maxStealTails = Math.floor(maxStealTails);
    this.stealFadeSamples = Math.max(1, Math.round(stealFadeSeconds * sampleRate));
    this.voiceGain = voiceGain;
    this.parameters = createDefaultVirtualAnalogParameters();
    this.masterLevel = 1;
    this.defaultWaveform = 'saw';
    this.defaultOscillator2 = { enabled: false, waveform: 'sine', level: 0.5, octave: 0, semitone: 0, fine: 0 };
    this.defaultNoise = { enabled: false, color: 'white', level: 0.25 };
    this.defaultSub = { enabled: false, waveform: 'square', level: 0.25, octave: -1 };
    this.defaultUnison = { voices: 1, detune: 12, spread: 0 };
    this.defaultEnvelope = { ...DEFAULT_ENVELOPE };
    this.defaultFilterEnvelope = {
      attack: 0.01, decay: 0.3, sustain: 0, release: 0.25, amount: 0,
    };
    this.defaultPitchEnvelope = { attack: 0.005, decay: 0.08, sustain: 0, release: 0.08 };
    this.defaultLfo = { rate: 1, waveform: 'sine', amount: 0 };
    this.modulationMatrix = new ModulationMatrix([
      { id: 'filter-eg-to-cutoff', source: 'filter-envelope', destination: 'filter-cutoff', amount: 0, enabled: true },
      { id: 'lfo-1-to-cutoff', source: 'lfo-1', destination: 'filter-cutoff', amount: 0, enabled: true },
    ]);
    this.voices = new Map();
    this.renderVoices = [];
    this.sequence = 0;
  }

  get voiceCount() { return this.voices.size; }
  get activeVoiceCount() {
    let count = 0;
    this.voices.forEach((voice) => { if (voice.stage !== 'steal') count++; });
    return count;
  }
  get stealTailCount() {
    let count = 0;
    this.voices.forEach((voice) => { if (voice.stage === 'steal') count++; });
    return count;
  }

  getVoice(id) {
    const voice = this.voices.get(id);
    return voice ? { ...voice, envelope: { ...voice.envelope }, filterEnvelope: { ...voice.filterEnvelope }, pitchEnvelope: { ...voice.pitchEnvelope }, lfo: { ...voice.lfo.oscillator.getParameters(), amount: voice.lfo.amount, phase: voice.lfo.oscillator.phase }, modulationRoutes: this.modulationMatrix.getRoutes(), filterRightState: voice.filterRight.getState(), wavetable: voice.wavetableOscillators ? { enabled: true, morph: voice.wavetableOscillators[0].morph, phase: voice.wavetableOscillators[0].phase, mipCurrentIndex: voice.wavetableOscillators[0].mipCurrentIndex, mipTargetIndex: voice.wavetableOscillators[0].mipTargetIndex } : { enabled: false, morph: 0, phase: voice.phase, mipCurrentIndex: 0, mipTargetIndex: 0 }, oscillator2: { ...voice.oscillator2 }, noise: { enabled: voice.noiseEnabled, color: voice.noise.color, level: voice.noiseLevel }, sub: { ...voice.sub }, unison: { voices: voice.unison.voices, detune: voice.unison.detune, spread: voice.unison.spread, oscillator1Phases: Array.from(voice.unison.oscillator1Phases), oscillator2Phases: Array.from(voice.unison.oscillator2Phases) }, filter: voice.filter.getParameters(), filterState: voice.filter.getState() } : undefined;
  }

  getParameters() {
    return { ...this.parameters };
  }

  setParameters(values = {}) {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('Virtual Analog parameters must be an object.');
    }
    this.parameters = normalizeVirtualAnalogParameters({ ...this.parameters, ...values });
    this.masterLevel = this.parameters['global.master-level'];
    this.defaultWaveform = this.parameters['engine.virtual-analog.osc-wave'];
    this.defaultOscillator2 = {
      enabled: this.parameters['engine.virtual-analog.osc2-enabled'],
      waveform: this.parameters['engine.virtual-analog.osc2-wave'],
      level: this.parameters['engine.virtual-analog.osc2-level'],
      octave: this.parameters['engine.virtual-analog.osc2-octave'],
      semitone: this.parameters['engine.virtual-analog.osc2-semitone'],
      fine: this.parameters['engine.virtual-analog.osc2-fine'],
    };
    this.defaultNoise = {
      enabled: this.parameters['engine.virtual-analog.noise-enabled'],
      color: this.parameters['engine.virtual-analog.noise-color'],
      level: this.parameters['engine.virtual-analog.noise-level'],
    };
    this.defaultSub = {
      enabled: this.parameters['engine.virtual-analog.sub-enabled'],
      waveform: this.parameters['engine.virtual-analog.sub-wave'],
      level: this.parameters['engine.virtual-analog.sub-level'],
      octave: this.parameters['engine.virtual-analog.sub-octave'],
    };
    this.defaultUnison = {
      voices: this.parameters['engine.virtual-analog.unison-voices'],
      detune: this.parameters['engine.virtual-analog.unison-detune'],
      spread: this.parameters['engine.virtual-analog.unison-spread'],
    };
    this.defaultEnvelope = {
      attack: this.parameters['engine.virtual-analog.amp-attack'],
      decay: this.parameters['engine.virtual-analog.amp-decay'],
      sustain: this.parameters['engine.virtual-analog.amp-sustain'],
      release: this.parameters['engine.virtual-analog.amp-release'],
    };
    this.defaultFilterEnvelope = {
      attack: this.parameters['engine.virtual-analog.filter-env-attack'],
      decay: this.parameters['engine.virtual-analog.filter-env-decay'],
      sustain: this.parameters['engine.virtual-analog.filter-env-sustain'],
      release: this.parameters['engine.virtual-analog.filter-env-release'],
      amount: this.parameters['engine.virtual-analog.filter-env-amount'],
    };
    this.defaultLfo = {
      rate: this.parameters['engine.virtual-analog.lfo1-rate'],
      waveform: this.parameters['engine.virtual-analog.lfo1-waveform'],
      amount: this.parameters['engine.virtual-analog.lfo1-amount'],
    };
    this.defaultPitchEnvelope = {
      attack: this.parameters['engine.virtual-analog.pitch-env-attack'],
      decay: this.parameters['engine.virtual-analog.pitch-env-decay'],
      sustain: this.parameters['engine.virtual-analog.pitch-env-sustain'],
      release: this.parameters['engine.virtual-analog.pitch-env-release'],
    };
    this.modulationMatrix.setRoutes([
      {
        id: 'filter-eg-to-cutoff',
        source: 'filter-envelope',
        destination: 'filter-cutoff',
        amount: this.defaultFilterEnvelope.amount,
        enabled: this.parameters['engine.virtual-analog.filter-env-route-enabled'],
      },
      { id: 'lfo-1-to-cutoff', source: 'lfo-1', destination: 'filter-cutoff', amount: this.defaultLfo.amount, enabled: this.parameters['engine.virtual-analog.lfo1-route-enabled'] },
      { id: 'eg-to-osc1-pitch', source: 'filter-envelope', destination: 'oscillator-1-pitch', amount: this.parameters['engine.virtual-analog.eg-osc1-pitch-amount'], enabled: this.parameters['engine.virtual-analog.eg-osc1-pitch-enabled'] },
      { id: 'lfo-to-osc1-pitch', source: 'lfo-1', destination: 'oscillator-1-pitch', amount: this.parameters['engine.virtual-analog.lfo-osc1-pitch-amount'], enabled: this.parameters['engine.virtual-analog.lfo-osc1-pitch-enabled'] },
      { id: 'eg-to-osc2-pitch', source: 'filter-envelope', destination: 'oscillator-2-pitch', amount: this.parameters['engine.virtual-analog.eg-osc2-pitch-amount'], enabled: this.parameters['engine.virtual-analog.eg-osc2-pitch-enabled'] },
      { id: 'lfo-to-osc2-pitch', source: 'lfo-1', destination: 'oscillator-2-pitch', amount: this.parameters['engine.virtual-analog.lfo-osc2-pitch-amount'], enabled: this.parameters['engine.virtual-analog.lfo-osc2-pitch-enabled'] },
      { id: 'pitch-env-to-osc1-pitch', source: 'pitch-envelope', destination: 'oscillator-1-pitch', amount: this.parameters['engine.virtual-analog.pitch-env-osc1-amount'], enabled: this.parameters['engine.virtual-analog.pitch-env-osc1-enabled'] },
      { id: 'pitch-env-to-osc2-pitch', source: 'pitch-envelope', destination: 'oscillator-2-pitch', amount: this.parameters['engine.virtual-analog.pitch-env-osc2-amount'], enabled: this.parameters['engine.virtual-analog.pitch-env-osc2-enabled'] },
      { id: 'eg-to-sub-pitch', source: 'filter-envelope', destination: 'sub-oscillator-pitch', amount: this.parameters['engine.virtual-analog.eg-sub-pitch-amount'], enabled: this.parameters['engine.virtual-analog.eg-sub-pitch-enabled'] },
      { id: 'pitch-env-to-sub-pitch', source: 'pitch-envelope', destination: 'sub-oscillator-pitch', amount: this.parameters['engine.virtual-analog.pitch-env-sub-pitch-amount'], enabled: this.parameters['engine.virtual-analog.pitch-env-sub-pitch-enabled'] },
      { id: 'lfo-to-sub-pitch', source: 'lfo-1', destination: 'sub-oscillator-pitch', amount: this.parameters['engine.virtual-analog.lfo-sub-pitch-amount'], enabled: this.parameters['engine.virtual-analog.lfo-sub-pitch-enabled'] },
    ]);
    const filterParameters = {
      mode: this.parameters['engine.virtual-analog.filter-mode'],
      cutoff: this.parameters['engine.virtual-analog.filter-cutoff'],
      resonance: this.parameters['engine.virtual-analog.filter-resonance'],
    };
    for (const voice of this.voices.values()) {
      Object.assign(voice.oscillator2, this.defaultOscillator2);
      voice.oscillator2.frequency = oscillatorFrequency2(voice.frequency, voice.oscillator2, this.sampleRate);
      voice.oscillator2.phaseIncrement = voice.oscillator2.frequency / this.sampleRate;
      voice.noiseEnabled = this.defaultNoise.enabled;
      voice.noiseLevel = this.defaultNoise.level;
      voice.noise.setColor(this.defaultNoise.color);
      Object.assign(voice.sub, this.defaultSub);
      voice.sub.frequency = Math.min(this.sampleRate * 0.45, voice.frequency * (2 ** voice.sub.octave));
      voice.sub.phaseIncrement = voice.sub.frequency / this.sampleRate;
      voice.unison.detune = this.defaultUnison.detune;
      if (voice.unison.spread > 0 && this.defaultUnison.spread === 0) {
        voice.filterRight.copyStateFrom(voice.filter);
      }
      voice.unison.spread = this.defaultUnison.spread;
      if (voice.unison.voices !== this.defaultUnison.voices) {
        const primaryOsc1Phase = voice.unison.oscillator1Phases[0] ?? voice.phase;
        const primaryOsc2Phase = voice.unison.oscillator2Phases[0] ?? voice.oscillator2.phase;
        voice.unison = {
          voices: this.defaultUnison.voices,
          detune: this.defaultUnison.detune,
          spread: this.defaultUnison.spread,
          oscillator1Phases: new Float64Array(this.defaultUnison.voices).fill(primaryOsc1Phase),
          oscillator2Phases: new Float64Array(this.defaultUnison.voices).fill(primaryOsc2Phase),
        };
        voice.phase = primaryOsc1Phase;
        voice.oscillator2.phase = primaryOsc2Phase;
        if (voice.wavetableOscillators) {
          const bank = voice.wavetableOscillators[0].bank;
          const morph = voice.wavetableOscillators[0].morph;
          voice.wavetableOscillators = Array.from({ length: this.defaultUnison.voices }, (_, lane) => new WavetableOscillator({
            bank,
            sampleRate: this.sampleRate,
            frequency: voice.frequency,
            phase: lane < voice.unison.oscillator1Phases.length ? voice.unison.oscillator1Phases[lane] : primaryOsc1Phase,
            morph,
          }));
        }
      }
      voice.filterBaseCutoff = filterParameters.cutoff;
      voice.filter.setParameters(filterParameters);
      voice.filterRight.setParameters(filterParameters);
      voice.lfo.amount = this.defaultLfo.amount;
      voice.lfo.oscillator.setParameters({
        rate: this.defaultLfo.rate,
        waveform: this.defaultLfo.waveform,
      });
      Object.assign(voice.filterEnvelope, this.defaultFilterEnvelope);
      if (voice.filterEnvelope.stage === 'release') {
        voice.filterEnvelope.stageSamples = 0;
        voice.filterEnvelope.releaseStep = voice.filterEnvelope.level /
          Math.max(1, Math.round(voice.filterEnvelope.release * this.sampleRate));
      }
      Object.assign(voice.pitchEnvelope, this.defaultPitchEnvelope);
      if (voice.pitchEnvelope.stage === 'release') {
        voice.pitchEnvelope.stageSamples = 0;
        voice.pitchEnvelope.releaseStep = voice.pitchEnvelope.level /
          Math.max(1, Math.round(voice.pitchEnvelope.release * this.sampleRate));
      }
    }
    return this.getParameters();
  }

  noteOn(input = {}) {
    const { id, note, frequency, velocity = 1 } = input;
    const waveform = input.waveform ?? this.defaultWaveform;
    const envelope = input.envelope ?? this.defaultEnvelope;
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('Voice id must be a non-empty string.');
    if (this.voices.has(id)) throw new Error(`Voice id already exists: ${id}`);
    assertFiniteRange('note', note, 0, 127);
    assertFiniteRange('frequency', frequency, 0.001, this.sampleRate * 0.499);
    assertFiniteRange('velocity', velocity, 0, 1);
    if (!SUPPORTED_WAVEFORMS.has(waveform)) {
      throw new TypeError(`waveform must be one of: ${[...SUPPORTED_WAVEFORMS].join(', ')}.`);
    }
    const normalizedEnvelope = normalizeEnvelope(envelope);
    let wavetableBank = null;
    let wavetableMorph = 0;
    if (input.wavetable !== undefined && input.wavetable !== null) {
      if (typeof input.wavetable !== 'object' || Array.isArray(input.wavetable)) throw new TypeError('wavetable must be an object.');
      wavetableMorph = input.wavetable.morph ?? 0;
      assertFiniteRange('wavetable morph', wavetableMorph, 0, 1);
      wavetableBank = getCachedWavetableBank(input.wavetable);
    }
    const oscillator2Frequency = oscillatorFrequency2(frequency, this.defaultOscillator2, this.sampleRate);
    const oscillator2 = {
      ...this.defaultOscillator2,
      phase: 0,
      frequency: oscillator2Frequency,
      phaseIncrement: oscillator2Frequency / this.sampleRate,
    };
    const noise = new NoiseGenerator({
      seed: (Math.imul(this.sequence + 1, 0x9e3779b1) >>> 0) || 1,
      color: this.defaultNoise.color,
    });
    const subFrequency = Math.min(this.sampleRate * 0.45, frequency * (2 ** this.defaultSub.octave));
    const sub = { ...this.defaultSub, phase: 0, frequency: subFrequency, phaseIncrement: subFrequency / this.sampleRate };
    const unison = {
      voices: this.defaultUnison.voices,
      detune: this.defaultUnison.detune,
      spread: this.defaultUnison.spread,
      oscillator1Phases: new Float64Array(this.defaultUnison.voices),
      oscillator2Phases: new Float64Array(this.defaultUnison.voices),
    };
    const filterEnvelope = {
      ...this.defaultFilterEnvelope,
      stage: 'attack',
      level: 0,
      stageSamples: 0,
      releaseStep: 0,
    };
    const pitchEnvelope = {
      ...this.defaultPitchEnvelope,
      stage: 'attack',
      level: 0,
      stageSamples: 0,
      releaseStep: 0,
    };
    const lfo = {
      oscillator: new LfoOscillator({
        sampleRate: this.sampleRate,
        rate: this.defaultLfo.rate,
        waveform: this.defaultLfo.waveform,
      }),
      amount: this.defaultLfo.amount,
    };
    const filterParameters = {
      sampleRate: this.sampleRate,
      mode: this.parameters['engine.virtual-analog.filter-mode'],
      cutoff: this.parameters['engine.virtual-analog.filter-cutoff'],
      resonance: this.parameters['engine.virtual-analog.filter-resonance'],
    };
    const filter = new TptStateVariableFilter(filterParameters);
    const filterRight = new TptStateVariableFilter(filterParameters);
    const wavetableOscillators = wavetableBank ? Array.from({ length: this.defaultUnison.voices }, (_, lane) => new WavetableOscillator({
      bank: wavetableBank, sampleRate: this.sampleRate, frequency,
      phase: unison.oscillator1Phases[lane], morph: wavetableMorph,
    })) : null;

    if (this.activeVoiceCount >= this.maxVoices) {
      if (this.stealTailCount >= this.maxStealTails) throw new Error('Steal-tail capacity reached; retry after the current audio block.');
      this.#stealOneVoice();
    }
    if (this.activeVoiceCount >= this.maxVoices) throw new Error('Polyphony limit reached; no voice could be allocated.');

    const voice = {
      id, note: Math.round(note), frequency, velocity, waveform, phase: 0, phaseIncrement: frequency / this.sampleRate, wavetableOscillators,
      stage: 'attack', envelope: normalizedEnvelope, envelopeLevel: 0,
      stageSamples: 0, startedAt: this.sequence++, releaseStep: 0,
      stealRemaining: 0, stealStartLevel: 0, filter, filterRight, filterBaseCutoff: this.parameters['engine.virtual-analog.filter-cutoff'], filterEnvelope, pitchEnvelope, lfo, oscillator2, noise, noiseEnabled: this.defaultNoise.enabled, noiseLevel: this.defaultNoise.level, sub, unison,
    };
    this.voices.set(id, voice);
    return id;
  }

  setWavetableMorph(id, morph) {
    assertFiniteRange('wavetable morph', morph, 0, 1);
    const voice = this.voices.get(id);
    if (!voice?.wavetableOscillators) return false;
    for (const oscillator of voice.wavetableOscillators) oscillator.setMorph(morph);
    return true;
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (!voice || voice.stage === 'release' || voice.stage === 'steal') return false;
    if (voice.envelope.release === 0 || voice.envelopeLevel <= 0) {
      this.voices.delete(id);
      return true;
    }
    const filterEnvelope = voice.filterEnvelope;
    const pitchEnvelope = voice.pitchEnvelope;
    if (filterEnvelope.stage !== 'idle' && filterEnvelope.stage !== 'release') {
      if (filterEnvelope.release === 0 || filterEnvelope.level <= 0) {
        filterEnvelope.level = 0;
        filterEnvelope.stage = 'idle';
      } else {
        filterEnvelope.stage = 'release';
        filterEnvelope.stageSamples = 0;
        filterEnvelope.releaseStep = filterEnvelope.level /
          Math.max(1, Math.round(filterEnvelope.release * this.sampleRate));
      }
    }
    if (pitchEnvelope.stage !== 'idle' && pitchEnvelope.stage !== 'release') {
      if (pitchEnvelope.release === 0 || pitchEnvelope.level <= 0) {
        pitchEnvelope.level = 0;
        pitchEnvelope.stage = 'idle';
      } else {
        pitchEnvelope.stage = 'release';
        pitchEnvelope.stageSamples = 0;
        pitchEnvelope.releaseStep = pitchEnvelope.level / Math.max(1, Math.round(pitchEnvelope.release * this.sampleRate));
      }
    }
    voice.stage = 'release';
    voice.stageSamples = 0;
    voice.releaseStartLevel = voice.envelopeLevel;
    voice.releaseStep = voice.releaseStartLevel / Math.max(1, Math.round(voice.envelope.release * this.sampleRate));
    return true;
  }

  #stealOneVoice() {
    let candidate;
    // Prefer an existing release tail; among equal states, steal the oldest.
    this.voices.forEach((voice) => {
      if (voice.stage === 'steal') return;
      if (!candidate || (voice.stage === 'release' && candidate.stage !== 'release') ||
          (voice.stage === candidate.stage && voice.startedAt < candidate.startedAt)) candidate = voice;
    });
    if (!candidate) return;
    candidate.stage = 'steal';
    candidate.stealRemaining = this.stealFadeSamples;
    candidate.stealStartLevel = candidate.envelopeLevel;
    candidate.stageSamples = 0;
  }

  #advanceEnvelope(voice) {
    const env = voice.envelope;
    switch (voice.stage) {
      case 'attack': {
        const total = Math.round(env.attack * this.sampleRate);
        if (total === 0) {
          voice.envelopeLevel = 1;
          voice.stage = env.decay === 0 ? 'sustain' : 'decay';
          voice.stageSamples = 0;
        } else {
          voice.envelopeLevel = Math.min(1, voice.envelopeLevel + 1 / total);
          voice.stageSamples++;
          if (voice.stageSamples >= total) {
            voice.envelopeLevel = 1;
            voice.stage = env.decay === 0 ? 'sustain' : 'decay';
            voice.stageSamples = 0;
          }
        }
        break;
      }
      case 'decay': {
        const total = Math.round(env.decay * this.sampleRate);
        if (total === 0) {
          voice.envelopeLevel = env.sustain;
          voice.stage = 'sustain';
        } else {
          voice.envelopeLevel = Math.max(env.sustain, voice.envelopeLevel - (1 - env.sustain) / total);
          voice.stageSamples++;
          if (voice.stageSamples >= total) {
            voice.envelopeLevel = env.sustain;
            voice.stage = 'sustain';
            voice.stageSamples = 0;
          }
        }
        break;
      }
      case 'release':
        voice.envelopeLevel = Math.max(0, voice.envelopeLevel - voice.releaseStep);
        voice.stageSamples++;
        if (voice.envelopeLevel <= 0 || voice.stageSamples >= Math.max(1, Math.round(env.release * this.sampleRate))) {
          voice.envelopeLevel = 0;
          this.voices.delete(voice.id);
        }
        break;
      case 'steal':
        voice.stealRemaining--;
        voice.envelopeLevel = voice.stealStartLevel * Math.max(0, voice.stealRemaining / this.stealFadeSamples);
        if (voice.stealRemaining <= 0) {
          voice.envelopeLevel = 0;
          this.voices.delete(voice.id);
        }
        break;
      case 'sustain':
      default:
        voice.envelopeLevel = env.sustain;
        break;
    }
  }

  #advancePitchEnvelope(voice) {
    const env = voice.pitchEnvelope;
    switch (env.stage) {
      case 'attack': {
        const total = Math.round(env.attack * this.sampleRate);
        if (total === 0) {
          env.level = 1;
          env.stage = env.decay === 0 ? 'sustain' : 'decay';
          env.stageSamples = 0;
        } else {
          env.level = Math.min(1, env.level + 1 / total);
          env.stageSamples++;
          if (env.stageSamples >= total) {
            env.level = 1;
            env.stage = env.decay === 0 ? 'sustain' : 'decay';
            env.stageSamples = 0;
          }
        }
        break;
      }
      case 'decay': {
        const total = Math.round(env.decay * this.sampleRate);
        if (total === 0) {
          env.level = env.sustain;
          env.stage = 'sustain';
          env.stageSamples = 0;
        } else {
          env.level = Math.max(env.sustain, env.level - (1 - env.sustain) / total);
          env.stageSamples++;
          if (env.stageSamples >= total) {
            env.level = env.sustain;
            env.stage = 'sustain';
            env.stageSamples = 0;
          }
        }
        break;
      }
      case 'release': {
        env.level = Math.max(0, env.level - env.releaseStep);
        env.stageSamples++;
        if (env.level <= 0 || env.stageSamples >= Math.max(1, Math.round(env.release * this.sampleRate))) {
          env.level = 0;
          env.stage = 'idle';
          env.stageSamples = 0;
        }
        break;
      }
      case 'sustain': env.level = env.sustain; break;
      case 'idle': default: env.level = 0; break;
    }
    return env.level;
  }

  #advanceFilterEnvelope(voice) {
    const env = voice.filterEnvelope;
    switch (env.stage) {
      case 'attack': {
        const total = Math.round(env.attack * this.sampleRate);
        if (total === 0) {
          env.level = 1;
          env.stage = env.decay === 0 ? 'sustain' : 'decay';
          env.stageSamples = 0;
        } else {
          env.level = Math.min(1, env.level + 1 / total);
          env.stageSamples++;
          if (env.stageSamples >= total) {
            env.level = 1;
            env.stage = env.decay === 0 ? 'sustain' : 'decay';
            env.stageSamples = 0;
          }
        }
        break;
      }
      case 'decay': {
        const total = Math.round(env.decay * this.sampleRate);
        if (total === 0) {
          env.level = env.sustain;
          env.stage = 'sustain';
          env.stageSamples = 0;
        } else {
          env.level = Math.max(env.sustain, env.level - (1 - env.sustain) / total);
          env.stageSamples++;
          if (env.stageSamples >= total) {
            env.level = env.sustain;
            env.stage = 'sustain';
            env.stageSamples = 0;
          }
        }
        break;
      }
      case 'release': {
        env.level = Math.max(0, env.level - env.releaseStep);
        env.stageSamples++;
        if (env.level <= 0 || env.stageSamples >= Math.max(1, Math.round(env.release * this.sampleRate))) {
          env.level = 0;
          env.stage = 'idle';
          env.stageSamples = 0;
        }
        break;
      }
      case 'sustain':
        env.level = env.sustain;
        break;
      case 'idle':
      default:
        env.level = 0;
        break;
    }
    return env.level;
  }

  render(left, right = left) {
    if (!(left instanceof Float32Array)) throw new TypeError('Left output must be a Float32Array.');
    if (right !== left && !(right instanceof Float32Array)) throw new TypeError('Right output must be a Float32Array.');
    if (right.length !== left.length) throw new RangeError('Output channels must have equal lengths.');
    left.fill(0);
    if (right !== left) right.fill(0);

    // Snapshot voice references once per render quantum. The scratch array is reused,
    // avoiding a Map callback/iterator allocation for every individual output sample.
    const renderVoices = this.renderVoices;
    renderVoices.length = 0;
    for (const voice of this.voices.values()) renderVoices.push(voice);

    const voiceGain = this.voiceGain * this.masterLevel;
    // Route coefficients are compiled when parameters change and snapshotted once
    // per render quantum, keeping the per-sample path to two multiplies and one sum.
    const filterEnvelopeCutoffAmount = this.modulationMatrix.filterEnvelopeCutoffAmount;
    const lfoCutoffAmount = this.modulationMatrix.lfoCutoffAmount;
    const egOsc1PitchAmount = this.modulationMatrix.filterEnvelopeOsc1PitchAmount;
    const lfoOsc1PitchAmount = this.modulationMatrix.lfoOsc1PitchAmount;
    const egOsc2PitchAmount = this.modulationMatrix.filterEnvelopeOsc2PitchAmount;
    const lfoOsc2PitchAmount = this.modulationMatrix.lfoOsc2PitchAmount;
    const pitchEnvelopeOsc1PitchAmount = this.modulationMatrix.pitchEnvelopeOsc1PitchAmount;
    const pitchEnvelopeOsc2PitchAmount = this.modulationMatrix.pitchEnvelopeOsc2PitchAmount;
    const filterEnvelopeSubPitchAmount = this.modulationMatrix.filterEnvelopeSubPitchAmount;
    const pitchEnvelopeSubPitchAmount = this.modulationMatrix.pitchEnvelopeSubPitchAmount;
    const lfoSubPitchAmount = this.modulationMatrix.lfoSubPitchAmount;
    for (let i = 0; i < left.length; i++) {
      let mixedLeft = 0;
      let mixedRight = 0;
      for (let voiceIndex = 0; voiceIndex < renderVoices.length; voiceIndex++) {
        const voice = renderVoices[voiceIndex];
        this.#advanceEnvelope(voice);
        const filterEnvelopeLevel = this.#advanceFilterEnvelope(voice);
        const pitchEnvelopeLevel = this.#advancePitchEnvelope(voice);
        const lfoValue = voice.lfo.oscillator.nextSample();
        const osc1PitchSemitones = (filterEnvelopeLevel * egOsc1PitchAmount) + (pitchEnvelopeLevel * pitchEnvelopeOsc1PitchAmount) + (lfoValue * lfoOsc1PitchAmount);
        const osc2PitchSemitones = (filterEnvelopeLevel * egOsc2PitchAmount) + (pitchEnvelopeLevel * pitchEnvelopeOsc2PitchAmount) + (lfoValue * lfoOsc2PitchAmount);
        const semitones = (filterEnvelopeLevel * filterEnvelopeCutoffAmount) + (lfoValue * lfoCutoffAmount);
        if (voice.filter.mode !== 'off') {
          const modulatedCutoff = semitones === 0
            ? voice.filterBaseCutoff
            : Math.min(
              this.sampleRate * 0.45,
              Math.max(20, voice.filterBaseCutoff * (2 ** (semitones / 12))),
            );
          voice.filter.setCutoff(modulatedCutoff);
          voice.filterRight.setCutoff(modulatedCutoff);
        }
        // A voice can expire in the middle of this block while its reference remains
        // in the snapshot. Its zero level keeps the remaining samples silent.
        if (voice.envelopeLevel <= 0) continue;

        const oscillator2 = voice.oscillator2;
        const hasOscillator2 = oscillator2.enabled && oscillator2.level > 0;
        const hasNoise = voice.noiseEnabled && voice.noiseLevel > 0;
        const sub = voice.sub;
        const hasSub = sub.enabled && sub.level > 0;
        let oscillatorSample;
        let oscillatorSampleLeft;
        let oscillatorSampleRight;

        if (voice.unison.voices === 1) {
          const oscillatorPhaseIncrement1 = osc1PitchSemitones === 0
            ? voice.phaseIncrement
            : Math.min(this.sampleRate * 0.45, voice.frequency * (2 ** (osc1PitchSemitones / 12))) / this.sampleRate;
          let oscillatorSample1;
          if (voice.wavetableOscillators) {
            const wavetableOscillator = voice.wavetableOscillators[0];
            wavetableOscillator.setFrequency(oscillatorPhaseIncrement1 * this.sampleRate);
            oscillatorSample1 = wavetableOscillator.processSample();
            voice.phase = wavetableOscillator.phase;
          } else {
            oscillatorSample1 = renderOscillatorSample(voice.waveform, voice.phase, oscillatorPhaseIncrement1);
          }
          const oscillatorPhaseIncrement2 = osc2PitchSemitones === 0
            ? oscillator2.phaseIncrement
            : Math.min(this.sampleRate * 0.45, oscillator2.frequency * (2 ** (osc2PitchSemitones / 12))) / this.sampleRate;
          oscillatorSample = oscillatorSample1;
          if (hasOscillator2) {
            const oscillatorSample2 = renderOscillatorSample(oscillator2.waveform, oscillator2.phase, oscillatorPhaseIncrement2);
            oscillatorSample = (oscillatorSample1 + (oscillatorSample2 * oscillator2.level)) / (1 + oscillator2.level);
          }
          oscillatorSampleLeft = oscillatorSample;
          oscillatorSampleRight = oscillatorSample;
          if (!voice.wavetableOscillators) {
            voice.phase += oscillatorPhaseIncrement1;
            if (voice.phase >= 1) voice.phase -= 1;
          }
          oscillator2.phase += oscillatorPhaseIncrement2;
          if (oscillator2.phase >= 1) oscillator2.phase -= 1;
          voice.unison.oscillator1Phases[0] = voice.phase;
          voice.unison.oscillator2Phases[0] = oscillator2.phase;
        } else {
          const laneCount = voice.unison.voices;
          const laneDetune = voice.unison.detune;
          const oscillator1Phases = voice.unison.oscillator1Phases;
          const oscillator2Phases = voice.unison.oscillator2Phases;
          let oscillator1Sum = 0;
          let oscillator2Sum = 0;
          let oscillator1LeftSum = 0;
          let oscillator1RightSum = 0;
          let oscillator2LeftSum = 0;
          let oscillator2RightSum = 0;
          const spreadActive = right !== left && laneCount > 1 && voice.unison.spread > 0;
          const spread = spreadActive ? voice.unison.spread / 100 : 0;
          for (let lane = 0; lane < laneCount; lane++) {
            const position = (lane / (laneCount - 1)) * 2 - 1;
            const detuneSemitones = (position * laneDetune) / 100;
            const oscillatorPhaseIncrement1 = Math.min(
              this.sampleRate * 0.45,
              voice.frequency * (2 ** ((osc1PitchSemitones + detuneSemitones) / 12)),
            ) / this.sampleRate;
            let oscillatorSample1;
            if (voice.wavetableOscillators) {
              const wavetableOscillator = voice.wavetableOscillators[lane];
              wavetableOscillator.setFrequency(oscillatorPhaseIncrement1 * this.sampleRate);
              oscillatorSample1 = wavetableOscillator.processSample();
              oscillator1Phases[lane] = wavetableOscillator.phase;
            } else {
              oscillatorSample1 = renderOscillatorSample(voice.waveform, oscillator1Phases[lane], oscillatorPhaseIncrement1);
            }
            oscillator1Sum += oscillatorSample1;
            const pan = position * spread;
            const leftGain = pan > 0 ? 1 - pan : 1;
            const rightGain = pan < 0 ? 1 + pan : 1;
            oscillator1LeftSum += oscillatorSample1 * leftGain;
            oscillator1RightSum += oscillatorSample1 * rightGain;
            if (!voice.wavetableOscillators) {
              oscillator1Phases[lane] += oscillatorPhaseIncrement1;
              if (oscillator1Phases[lane] >= 1) oscillator1Phases[lane] -= 1;
            }

            const oscillatorPhaseIncrement2 = Math.min(
              this.sampleRate * 0.45,
              oscillator2.frequency * (2 ** ((osc2PitchSemitones + detuneSemitones) / 12)),
            ) / this.sampleRate;
            if (hasOscillator2) {
              const oscillatorSample2 = renderOscillatorSample(oscillator2.waveform, oscillator2Phases[lane], oscillatorPhaseIncrement2);
              oscillator2Sum += oscillatorSample2;
              oscillator2LeftSum += oscillatorSample2 * leftGain;
              oscillator2RightSum += oscillatorSample2 * rightGain;
            }
            oscillator2Phases[lane] += oscillatorPhaseIncrement2;
            if (oscillator2Phases[lane] >= 1) oscillator2Phases[lane] -= 1;
          }
          voice.phase = oscillator1Phases[0];
          oscillator2.phase = oscillator2Phases[0];
          const oscillatorSample1 = oscillator1Sum / laneCount;
          oscillatorSample = hasOscillator2
            ? (oscillatorSample1 + ((oscillator2Sum / laneCount) * oscillator2.level)) / (1 + oscillator2.level)
            : oscillatorSample1;
          if (spread > 0) {
            const oscillatorSample1Left = oscillator1LeftSum / laneCount;
            const oscillatorSample1Right = oscillator1RightSum / laneCount;
            const oscillatorSample2Left = oscillator2LeftSum / laneCount;
            const oscillatorSample2Right = oscillator2RightSum / laneCount;
            oscillatorSampleLeft = hasOscillator2
              ? (oscillatorSample1Left + (oscillatorSample2Left * oscillator2.level)) / (1 + oscillator2.level)
              : oscillatorSample1Left;
            oscillatorSampleRight = hasOscillator2
              ? (oscillatorSample1Right + (oscillatorSample2Right * oscillator2.level)) / (1 + oscillator2.level)
              : oscillatorSample1Right;
          } else {
            oscillatorSampleLeft = oscillatorSample;
            oscillatorSampleRight = oscillatorSample;
          }
        }

        let subSample = 0;
        if (hasSub) {
          const subPitchSemitones = osc1PitchSemitones + (filterEnvelopeLevel * filterEnvelopeSubPitchAmount) + (pitchEnvelopeLevel * pitchEnvelopeSubPitchAmount) + (lfoValue * lfoSubPitchAmount);
          const subPhaseIncrement = Math.min(
            this.sampleRate * 0.45,
            sub.frequency * (2 ** (subPitchSemitones / 12)),
          ) / this.sampleRate;
          subSample = renderOscillatorSample(sub.waveform, sub.phase, subPhaseIncrement);
          sub.phase += subPhaseIncrement;
        } else {
          sub.phase += sub.phaseIncrement;
        }
        if (sub.phase >= 1) sub.phase -= 1;

        if (hasSub || hasNoise) {
          const oscillator2Level = hasOscillator2 ? oscillator2.level : 0;
          const baseNormalization = 1 + oscillator2Level;
          let summedLeft = oscillatorSampleLeft * baseNormalization;
          let summedRight = oscillatorSampleRight * baseNormalization;
          let normalization = baseNormalization;
          if (hasSub) {
            summedLeft += subSample * sub.level;
            summedRight += subSample * sub.level;
            normalization += sub.level;
          }
          if (hasNoise) {
            const noiseSample = voice.noise.nextSample() * voice.noiseLevel;
            summedLeft += noiseSample;
            summedRight += noiseSample;
            normalization += voice.noiseLevel;
          }
          oscillatorSampleLeft = summedLeft / normalization;
          oscillatorSampleRight = summedRight / normalization;
        }
        const filteredLeft = voice.filter.process(oscillatorSampleLeft);
        const spreadActive = right !== left && voice.unison.voices > 1 && voice.unison.spread > 0;
        const filteredRight = spreadActive ? voice.filterRight.process(oscillatorSampleRight) : filteredLeft;
        const gain = voice.velocity * voice.envelopeLevel * voiceGain;
        mixedLeft += filteredLeft * gain;
        mixedRight += filteredRight * gain;
      }
      left[i] = mixedLeft;
      if (right !== left) right[i] = mixedRight;
    }
    for (const voice of renderVoices) {
      if (right === left || voice.unison.voices <= 1 || voice.unison.spread === 0) {
        voice.filterRight.copyStateFrom(voice.filter);
      }
    }
  }
}