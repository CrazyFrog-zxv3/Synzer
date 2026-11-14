const TWO_PI = Math.PI * 2;
const OPERATOR_COUNT = 4;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function createDefaultFMParameters() {
  const values = { 'global.master-level': 0.8, 'engine.fm.algorithm': 1, 'engine.fm.feedback': 0 };
  for (let op = 1; op <= OPERATOR_COUNT; op++) {
    values[`engine.fm.op${op}-ratio`] = 1;
    values[`engine.fm.op${op}-level`] = op === 1 ? 0.8 : 0.7;
    values[`engine.fm.op${op}-index`] = op === 1 ? 0 : 2.5;
    values[`engine.fm.op${op}-attack`] = op === 1 ? 0.005 : 0.002;
    values[`engine.fm.op${op}-decay`] = 0.15;
    values[`engine.fm.op${op}-sustain`] = op === 1 ? 0.85 : 0.65;
    values[`engine.fm.op${op}-release`] = 0.22;
  }
  return values;
}

function normalizeParameters(current, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('FM parameters must be an object.');
  const next = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(current, key)) throw new Error(`Unknown FM parameter: ${key}`);
    if (!Number.isFinite(value)) throw new TypeError(`${key} must be finite.`);
    if (key === 'global.master-level') {
      if (value < 0 || value > 1) throw new RangeError('Master level must be between 0 and 1.');
    } else if (key === 'engine.fm.algorithm') {
      if (!Number.isInteger(value) || value < 1 || value > 4) throw new RangeError('FM algorithm must be an integer from 1 to 4.');
    } else if (key === 'engine.fm.feedback') {
      if (value < 0 || value > 1) throw new RangeError('FM feedback must be between 0 and 1.');
    } else {
      const match = /^engine\.fm\.op([1-4])-(ratio|level|index|attack|decay|sustain|release)$/.exec(key);
      const ranges = { ratio: [0.0625, 32], level: [0, 1], index: [0, 16], attack: [0, 30], decay: [0, 30], sustain: [0, 1], release: [0, 60] };
      const [min, max] = ranges[match[2]];
      if (value < min || value > max) throw new RangeError(`${key} must be between ${min} and ${max}.`);
    }
    next[key] = value;
  }
  return next;
}

function createEnvelope(parameters, op) {
  return { stage: 'attack', level: 0, elapsed: 0, releaseStart: 0,
    attack: parameters[`engine.fm.op${op}-attack`], decay: parameters[`engine.fm.op${op}-decay`],
    sustain: parameters[`engine.fm.op${op}-sustain`], release: parameters[`engine.fm.op${op}-release`] };
}

function envelopeSample(envelope, dt) {
  if (envelope.stage === 'attack') {
    if (envelope.attack <= 0) { envelope.level = 1; envelope.stage = 'decay'; envelope.elapsed = 0; }
    else { envelope.elapsed += dt; envelope.level = Math.min(1, envelope.elapsed / envelope.attack); if (envelope.level >= 1) { envelope.stage = 'decay'; envelope.elapsed = 0; } }
  }
  if (envelope.stage === 'decay') {
    if (envelope.decay <= 0) { envelope.level = envelope.sustain; envelope.stage = 'sustain'; }
    else { envelope.elapsed += dt; const t = Math.min(1, envelope.elapsed / envelope.decay); envelope.level = 1 + (envelope.sustain - 1) * t; if (t >= 1) envelope.stage = 'sustain'; }
  }
  if (envelope.stage === 'sustain') envelope.level = envelope.sustain;
  if (envelope.stage === 'release') {
    if (envelope.release <= 0) { envelope.level = 0; envelope.stage = 'done'; }
    else { envelope.elapsed += dt; envelope.level = envelope.releaseStart * Math.max(0, 1 - envelope.elapsed / envelope.release); if (envelope.elapsed >= envelope.release) envelope.stage = 'done'; }
  }
  return envelope.level;
}

const ALGORITHMS = Object.freeze({
  1: { carriers: [0], routes: [[1], [2], [3], []] },
  2: { carriers: [0, 2], routes: [[1], [], [3], []] },
  3: { carriers: [0, 3], routes: [[1, 2], [], [], []] },
  4: { carriers: [0, 1, 2, 3], routes: [[], [], [], []] },
});

export class FMVoiceEngine {
  constructor({ sampleRate, maxVoices = 12, voiceGain = 0.075 } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw new RangeError('sampleRate must be between 8000 and 384000.');
    if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 256) throw new RangeError('maxVoices must be between 1 and 256.');
    if (!Number.isFinite(voiceGain) || voiceGain < 0 || voiceGain > 1) throw new RangeError('voiceGain must be between 0 and 1.');
    this.sampleRate = sampleRate;
    this.maxVoices = maxVoices;
    this.voiceGain = voiceGain;
    this.parameters = createDefaultFMParameters();
    this.runtime = this.#compileParameters(this.parameters);
    this.voices = new Map();
    this.sequence = 0;
  }

  #compileParameters(parameters) {
    const algorithm = ALGORITHMS[parameters['engine.fm.algorithm']];
    const ratios = new Float64Array(OPERATOR_COUNT);
    const modulationWeights = new Float64Array(OPERATOR_COUNT);
    const carrierWeights = new Float64Array(OPERATOR_COUNT);
    for (let index = 0; index < OPERATOR_COUNT; index++) {
      const op = index + 1;
      ratios[index] = parameters[`engine.fm.op${op}-ratio`];
      modulationWeights[index] = parameters[`engine.fm.op${op}-level`] * parameters[`engine.fm.op${op}-index`];
      carrierWeights[index] = parameters[`engine.fm.op${op}-level`];
    }
    return { ratios, modulationWeights, carrierWeights, carriers: algorithm.carriers, routes: algorithm.routes,
      feedback: parameters['engine.fm.feedback'], masterGain: this.voiceGain * parameters['global.master-level'] };
  }

  getParameters() { return { ...this.parameters }; }

  setParameters(values = {}) {
    this.parameters = normalizeParameters(this.parameters, values);
    this.runtime = this.#compileParameters(this.parameters);
    for (const voice of this.voices.values()) {
      for (let index = 0; index < OPERATOR_COUNT; index++) {
        const op = index + 1;
        const env = voice.envelopes[index];
        voice.phaseIncrements[index] = Math.min(0.49, voice.frequency * this.runtime.ratios[index] / this.sampleRate);
        env.attack = this.parameters[`engine.fm.op${op}-attack`];
        env.decay = this.parameters[`engine.fm.op${op}-decay`];
        env.sustain = this.parameters[`engine.fm.op${op}-sustain`];
        env.release = this.parameters[`engine.fm.op${op}-release`];
      }
    }
    return this.getParameters();
  }

  noteOn({ id, note, frequency, velocity = 1 } = {}) {
    if (typeof id !== 'string' || !id || !Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(velocity) || velocity < 0 || velocity > 1) {
      throw new TypeError('FM voice requires an id, positive frequency, and velocity from 0 to 1.');
    }
    if (this.voices.has(id)) throw new Error(`FM voice already exists: ${id}`);
    if (this.voices.size >= this.maxVoices) {
      const oldest = [...this.voices.values()].sort((a, b) => a.sequence - b.sequence)[0];
      if (oldest) this.voices.delete(oldest.id);
    }
    const phaseIncrements = new Float64Array(OPERATOR_COUNT);
    for (let index = 0; index < OPERATOR_COUNT; index++) phaseIncrements[index] = Math.min(0.49, frequency * this.runtime.ratios[index] / this.sampleRate);
    this.voices.set(id, { id, note, frequency, velocity, sequence: ++this.sequence,
      phases: new Float64Array(OPERATOR_COUNT), phaseIncrements, outputs: new Float64Array(OPERATOR_COUNT),
      envelopeLevels: new Float64Array(OPERATOR_COUNT), feedbackSample: 0,
      envelopes: [1, 2, 3, 4].map((op) => createEnvelope(this.parameters, op)), released: false });
    return id;
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (!voice || voice.released) return false;
    voice.released = true;
    for (const envelope of voice.envelopes) {
      envelope.releaseStart = envelope.level;
      envelope.elapsed = 0;
      envelope.stage = 'release';
    }
    return true;
  }

  getVoice(id) {
    const voice = this.voices.get(id);
    return voice ? { id: voice.id, phases: [...voice.phases], released: voice.released, envelopes: voice.envelopes.map((env) => ({ ...env })) } : null;
  }

  render(left, right = left) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) throw new TypeError('FM render outputs must be equally sized Float32Arrays.');
    const dt = 1 / this.sampleRate;
    const runtime = this.runtime;
    const carriers = runtime.carriers;
    const routes = runtime.routes;
    for (let sample = 0; sample < left.length; sample++) {
      let mixed = 0;
      for (const voice of this.voices.values()) {
        const outputs = voice.outputs;
        const levels = voice.envelopeLevels;
        const phases = voice.phases;
        const increments = voice.phaseIncrements;
        for (let op = 0; op < OPERATOR_COUNT; op++) levels[op] = envelopeSample(voice.envelopes[op], dt);
        for (let op = OPERATOR_COUNT - 1; op >= 0; op--) {
          const sources = routes[op];
          let modulation = 0;
          if (sources.length === 1) modulation = outputs[sources[0]] * runtime.modulationWeights[sources[0]];
          else if (sources.length === 2) modulation = outputs[sources[0]] * runtime.modulationWeights[sources[0]] + outputs[sources[1]] * runtime.modulationWeights[sources[1]];
          if (op === 3 && runtime.feedback > 0) modulation += voice.feedbackSample * runtime.feedback * runtime.modulationWeights[3];
          outputs[op] = Math.sin(TWO_PI * phases[op] + modulation) * levels[op] * voice.velocity;
          phases[op] += increments[op];
          if (phases[op] >= 1) phases[op] -= 1;
        }
        voice.feedbackSample = outputs[3];
        let carrier = 0;
        for (const op of carriers) carrier += outputs[op] * runtime.carrierWeights[op];
        mixed += carrier * runtime.masterGain;
      }
      const value = clamp(mixed, -1, 1);
      left[sample] = value;
      right[sample] = value;
    }
    for (const [id, voice] of this.voices) {
      if (voice.released && voice.envelopes.every((env) => env.stage === 'done')) this.voices.delete(id);
    }
  }
}
