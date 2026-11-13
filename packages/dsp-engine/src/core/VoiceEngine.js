const DEFAULT_ENVELOPE = Object.freeze({ attack: 0.01, decay: 0.08, sustain: 0.75, release: 0.25 });
const SUPPORTED_WAVEFORMS = new Set(['saw', 'square', 'sine']);

function finiteRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}.`);
}
function envelopeOf(input = {}) {
  const e = { ...DEFAULT_ENVELOPE, ...input };
  finiteRange('attack', e.attack, 0, 30);
  finiteRange('decay', e.decay, 0, 30);
  finiteRange('sustain', e.sustain, 0, 1);
  finiteRange('release', e.release, 0, 60);
  return e;
}
export function polyBlep(phase, dt) {
  if (!(dt > 0) || dt >= 0.5) return 0;
  if (phase < dt) { const t = phase / dt; return t + t - t * t - 1; }
  if (phase > 1 - dt) { const t = (phase - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
export class VoiceEngine {
  constructor({ sampleRate, maxVoices = 12, maxStealTails = 4, stealFadeSeconds = 0.005, voiceGain = 0.075 } = {}) {
    finiteRange('sampleRate', sampleRate, 8000, 384000);
    finiteRange('maxVoices', maxVoices, 1, 256);
    finiteRange('voiceGain', voiceGain, 0, 1);
    this.sampleRate = sampleRate;
    this.maxVoices = Math.floor(maxVoices);
    this.voiceGain = voiceGain;
    this.fadeSamples = Math.max(1, Math.round(stealFadeSeconds * sampleRate));
    this.maxStealTails = maxStealTails;
    this.voices = new Map();
    this.renderVoices = [];
    this.sequence = 0;
  }
  get voiceCount() { return this.voices.size; }
  get activeVoiceCount() { return [...this.voices.values()].filter(v => v.stage !== 'steal').length; }
  get stealTailCount() { return [...this.voices.values()].filter(v => v.stage === 'steal').length; }
  getVoice(id) { const v = this.voices.get(id); return v ? { ...v, envelope: { ...v.envelope } } : undefined; }
  noteOn({ id = `voice-${++this.sequence}`, note, frequency, velocity = 1, waveform = 'saw', envelope = DEFAULT_ENVELOPE } = {}) {
    if (typeof id !== 'string' || !id || this.voices.has(id)) throw new TypeError('Voice id must be a unique non-empty string.');
    finiteRange('note', note, 0, 127); finiteRange('frequency', frequency, 0.001, this.sampleRate * 0.499);
    finiteRange('velocity', velocity, 0, 1);
    if (!SUPPORTED_WAVEFORMS.has(waveform)) throw new TypeError('Unsupported waveform.');
    if (this.activeVoiceCount >= this.maxVoices) {
      const victim = [...this.voices.values()].find(v => v.stage === 'release') ?? this.voices.values().next().value;
      if (!victim) throw new Error('Polyphony limit reached.');
      if (this.stealTailCount >= this.maxStealTails) throw new Error('Steal-tail capacity reached.');
      victim.stage = 'steal'; victim.fadeLeft = this.fadeSamples; victim.fadeStart = victim.level;
    }
    const e = envelopeOf(envelope);
    this.voices.set(id, { id, note, frequency, velocity, waveform, phase: 0, phaseStep: frequency / this.sampleRate,
      stage: 'attack', envelope: e, level: 0, stageSamples: 0, releaseStep: 0, fadeLeft: 0, fadeStart: 0 });
    return id;
  }
  noteOff(id) {
    const v = this.voices.get(id);
    if (!v || v.stage === 'release' || v.stage === 'steal') return false;
    if (v.envelope.release === 0 || v.level <= 0) { this.voices.delete(id); return true; }
    v.stage = 'release'; v.stageSamples = 0;
    v.releaseStep = v.level / Math.max(1, Math.round(v.envelope.release * this.sampleRate));
    return true;
  }
  advance(v) {
    const e = v.envelope;
    if (v.stage === 'attack') {
      const n = Math.round(e.attack * this.sampleRate);
      if (!n) { v.level = 1; v.stage = e.decay ? 'decay' : 'sustain'; v.stageSamples = 0; }
      else if (++v.stageSamples >= n) { v.level = 1; v.stage = e.decay ? 'decay' : 'sustain'; v.stageSamples = 0; }
      else v.level = Math.min(1, v.stageSamples / n);
    } else if (v.stage === 'decay') {
      const n = Math.round(e.decay * this.sampleRate);
      if (!n || ++v.stageSamples >= n) { v.level = e.sustain; v.stage = 'sustain'; v.stageSamples = 0; }
      else v.level = 1 - (1 - e.sustain) * (v.stageSamples / n);
    } else if (v.stage === 'release') {
      v.level = Math.max(0, v.level - v.releaseStep);
      if (++v.stageSamples >= Math.max(1, Math.round(e.release * this.sampleRate)) || v.level <= 0) this.voices.delete(v.id);
    } else if (v.stage === 'steal') {
      v.level = v.fadeStart * Math.max(0, --v.fadeLeft) / this.fadeSamples;
      if (v.fadeLeft <= 0) this.voices.delete(v.id);
    } else v.level = e.sustain;
  }
  render(left, right = left) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) throw new TypeError('Output channels must be equal-length Float32Arrays.');
    left.fill(0); if (right !== left) right.fill(0);
    const voices = this.renderVoices; voices.length = 0;
    for (const v of this.voices.values()) voices.push(v);
    for (let i = 0; i < left.length; i++) {
      let mix = 0;
      for (const v of voices) {
        this.advance(v); if (v.level <= 0) continue;
        const p = v.phase, dt = v.phaseStep;
        let sample;
        if (v.waveform === 'sine') sample = Math.sin(2 * Math.PI * p);
        else if (v.waveform === 'square') sample = (p < 0.5 ? 1 : -1) + polyBlep(p, dt) - polyBlep((p + 0.5) % 1, dt);
        else sample = 2 * p - 1 - polyBlep(p, dt);
        mix += sample * v.velocity * v.level * this.voiceGain;
        v.phase += dt; if (v.phase >= 1) v.phase -= 1;
      }
      left[i] = mix; if (right !== left) right[i] = mix;
    }
  }
}
