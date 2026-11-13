import { createDefaultVirtualAnalogParameters, normalizeVirtualAnalogParameters } from './VirtualAnalogParameters.js';
import { TptStateVariableFilter } from './TptStateVariableFilter.js';

const DEFAULT_ENVELOPE = Object.freeze({ attack: 0.01, decay: 0.08, sustain: 0.75, release: 0.25 });
const SUPPORTED_WAVEFORMS = new Set(['saw', 'square', 'sine']);

function assertFiniteRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
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
    this.defaultEnvelope = { ...DEFAULT_ENVELOPE };
    this.defaultFilterEnvelope = {
      attack: 0.01, decay: 0.3, sustain: 0, release: 0.25, amount: 0,
    };
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
    return voice ? { ...voice, envelope: { ...voice.envelope }, filterEnvelope: { ...voice.filterEnvelope }, filter: voice.filter.getParameters(), filterState: voice.filter.getState() } : undefined;
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
    const filterParameters = {
      mode: this.parameters['engine.virtual-analog.filter-mode'],
      cutoff: this.parameters['engine.virtual-analog.filter-cutoff'],
      resonance: this.parameters['engine.virtual-analog.filter-resonance'],
    };
    for (const voice of this.voices.values()) {
      voice.filterBaseCutoff = filterParameters.cutoff;
      voice.filter.setParameters(filterParameters);
      Object.assign(voice.filterEnvelope, this.defaultFilterEnvelope);
      if (voice.filterEnvelope.stage === 'release') {
        voice.filterEnvelope.stageSamples = 0;
        voice.filterEnvelope.releaseStep = voice.filterEnvelope.level /
          Math.max(1, Math.round(voice.filterEnvelope.release * this.sampleRate));
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
    const filterEnvelope = {
      ...this.defaultFilterEnvelope,
      stage: 'attack',
      level: 0,
      stageSamples: 0,
      releaseStep: 0,
    };
    const filter = new TptStateVariableFilter({
      sampleRate: this.sampleRate,
      mode: this.parameters['engine.virtual-analog.filter-mode'],
      cutoff: this.parameters['engine.virtual-analog.filter-cutoff'],
      resonance: this.parameters['engine.virtual-analog.filter-resonance'],
    });

    if (this.activeVoiceCount >= this.maxVoices) {
      if (this.stealTailCount >= this.maxStealTails) throw new Error('Steal-tail capacity reached; retry after the current audio block.');
      this.#stealOneVoice();
    }
    if (this.activeVoiceCount >= this.maxVoices) throw new Error('Polyphony limit reached; no voice could be allocated.');

    const voice = {
      id, note: Math.round(note), frequency, velocity, waveform, phase: 0, phaseIncrement: frequency / this.sampleRate,
      stage: 'attack', envelope: normalizedEnvelope, envelopeLevel: 0,
      stageSamples: 0, startedAt: this.sequence++, releaseStep: 0,
      stealRemaining: 0, stealStartLevel: 0, filter, filterBaseCutoff: this.parameters['engine.virtual-analog.filter-cutoff'], filterEnvelope,
    };
    this.voices.set(id, voice);
    return id;
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (!voice || voice.stage === 'release' || voice.stage === 'steal') return false;
    if (voice.envelope.release === 0 || voice.envelopeLevel <= 0) {
      this.voices.delete(id);
      return true;
    }
    const filterEnvelope = voice.filterEnvelope;
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
    for (let i = 0; i < left.length; i++) {
      let mixed = 0;
      for (let voiceIndex = 0; voiceIndex < renderVoices.length; voiceIndex++) {
        const voice = renderVoices[voiceIndex];
        this.#advanceEnvelope(voice);
        const filterEnvelopeLevel = this.#advanceFilterEnvelope(voice);
        if (voice.filter.mode !== 'off' && voice.filterEnvelope.amount !== 0) {
          const semitones = voice.filterEnvelope.amount * filterEnvelopeLevel;
          const modulatedCutoff = Math.min(
            this.sampleRate * 0.45,
            Math.max(20, voice.filterBaseCutoff * (2 ** (semitones / 12))),
          );
          voice.filter.setCutoff(modulatedCutoff);
        }
        // A voice can expire in the middle of this block while its reference remains
        // in the snapshot. Its zero level keeps the remaining samples silent.
        if (voice.envelopeLevel <= 0) continue;

        const dt = voice.phaseIncrement;
        let oscillatorSample;
        if (voice.waveform === 'sine') {
          oscillatorSample = Math.sin(2 * Math.PI * voice.phase);
        } else if (voice.waveform === 'square') {
          oscillatorSample = (voice.phase < 0.5 ? 1 : -1) +
            polyBlep(voice.phase, dt) - polyBlep((voice.phase + 0.5) % 1, dt);
        } else {
          oscillatorSample = (2 * voice.phase) - 1 - polyBlep(voice.phase, dt);
        }
        const filteredSample = voice.filter.process(oscillatorSample);
        mixed += filteredSample * voice.velocity * voice.envelopeLevel * voiceGain;
        voice.phase += dt;
        if (voice.phase >= 1) voice.phase -= 1;
      }
      left[i] = mixed;
      if (right !== left) right[i] = mixed;
    }
  }
}