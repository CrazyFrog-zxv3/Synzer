const COMB_LENGTHS = [1116, 1188, 1277, 1356];
const ALLPASS_LENGTHS = [556, 441];
const EARLY_REFLECTIONS = [7, 11, 17, 23];
const EARLY_GAINS = [0.48, 0.34, 0.23, 0.15];

function validate(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

class CircularDelay {
  constructor(maxSamples, delaySamples = 0) {
    this.buffer = new Float32Array(Math.max(2, maxSamples + 2));
    this.index = 0;
    this.delaySamples = delaySamples;
  }
  setDelay(samples) { this.delaySamples = samples; }
  process(input) {
    const readIndex = (this.index - this.delaySamples + this.buffer.length) % this.buffer.length;
    const output = this.delaySamples === 0 ? input : this.buffer[readIndex];
    this.buffer[this.index] = input;
    this.index += 1;
    if (this.index === this.buffer.length) this.index = 0;
    return output;
  }
  reset() { this.buffer.fill(0); this.index = 0; }
}

class FeedbackComb {
  constructor(length) {
    this.buffer = new Float32Array(length);
    this.index = 0;
    this.filterState = 0;
  }
  process(input, feedback, damping) {
    const output = this.buffer[this.index];
    this.filterState = (output * (1 - damping)) + (this.filterState * damping);
    this.buffer[this.index] = input + (this.filterState * feedback);
    this.index += 1;
    if (this.index === this.buffer.length) this.index = 0;
    return output;
  }
  reset() { this.buffer.fill(0); this.index = 0; this.filterState = 0; }
}

class DiffusionAllpass {
  constructor(length, maxModulationSamples) {
    this.delaySamples = length;
    this.buffer = new Float32Array(length + Math.ceil(maxModulationSamples) + 2);
    this.index = 0;
  }
  process(input, modulationSamples = 0) {
    if (modulationSamples === 0) {
      const readIndex = (this.index - this.delaySamples + this.buffer.length) % this.buffer.length;
      const delayed = this.buffer[readIndex];
      const output = delayed - input;
      this.buffer[this.index] = input + (delayed * 0.5);
      this.index += 1;
      if (this.index === this.buffer.length) this.index = 0;
      return output;
    }
    const readPosition = (this.index - this.delaySamples - modulationSamples + this.buffer.length) % this.buffer.length;
    const readIndex = Math.floor(readPosition);
    const fraction = readPosition - readIndex;
    const nextIndex = (readIndex + 1) % this.buffer.length;
    const delayed = (this.buffer[readIndex] * (1 - fraction)) + (this.buffer[nextIndex] * fraction);
    const output = delayed - input;
    this.buffer[this.index] = input + (delayed * 0.5);
    this.index += 1;
    if (this.index === this.buffer.length) this.index = 0;
    return output;
  }
  reset() { this.buffer.fill(0); this.index = 0; }
}

export class StereoReverb {
  constructor({ sampleRate, roomSize = 0.72, damping = 0.35, mix = 0, width = 0.8, preDelayMs = 0, earlyLevel = 0.65, modulationRateHz = 0.35, modulationDepthMs = 0 } = {}) {
    validate('sampleRate', sampleRate, 8000, 384000);
    this.sampleRate = sampleRate;
    const scale = sampleRate / 44100;
    this.combsLeft = COMB_LENGTHS.map((length) => new FeedbackComb(Math.max(8, Math.round(length * scale))));
    this.combsRight = COMB_LENGTHS.map((length) => new FeedbackComb(Math.max(8, Math.round((length + 23) * scale))));
    const maxModulationSamples = sampleRate * 0.002;
    this.allpassLeft = ALLPASS_LENGTHS.map((length) => new DiffusionAllpass(Math.max(8, Math.round(length * scale)), maxModulationSamples));
    this.allpassRight = ALLPASS_LENGTHS.map((length) => new DiffusionAllpass(Math.max(8, Math.round((length + 17) * scale)), maxModulationSamples));
    this.preDelayLeft = new CircularDelay(Math.ceil(sampleRate * 0.2));
    this.preDelayRight = new CircularDelay(Math.ceil(sampleRate * 0.2));
    this.earlyLeft = EARLY_REFLECTIONS.map((ms, index) => new CircularDelay(Math.ceil(sampleRate * 0.2), Math.max(1, Math.round(((ms + (index * 0.35)) / 1000) * sampleRate))));
    this.earlyRight = EARLY_REFLECTIONS.map((ms, index) => new CircularDelay(Math.ceil(sampleRate * 0.2), Math.max(1, Math.round(((ms + 1.8 + (index * 0.25)) / 1000) * sampleRate))));
    this.crossEarlyLeft = new CircularDelay(Math.ceil(sampleRate * 0.2), Math.max(1, Math.round(0.013 * sampleRate)));
    this.crossEarlyRight = new CircularDelay(Math.ceil(sampleRate * 0.2), Math.max(1, Math.round(0.009 * sampleRate)));
    this.roomSize = 0.72;
    this.damping = 0.35;
    this.mix = 0;
    this.width = 0.8;
    this.preDelayMs = 0;
    this.earlyLevel = 0.65;
    this.modulationRateHz = 0.35;
    this.modulationDepthMs = 0;
    this.modulationPhase = 0;
    this.setParameters({ roomSize, damping, mix, width, preDelayMs, earlyLevel, modulationRateHz, modulationDepthMs });
  }

  getParameters() { return { roomSize: this.roomSize, damping: this.damping, mix: this.mix, width: this.width, preDelayMs: this.preDelayMs, earlyLevel: this.earlyLevel, modulationRateHz: this.modulationRateHz, modulationDepthMs: this.modulationDepthMs }; }

  setParameters(values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Reverb parameters must be an object.');
    const next = { ...this.getParameters(), ...values };
    for (const key of Object.keys(values)) if (!['roomSize', 'damping', 'mix', 'width', 'preDelayMs', 'earlyLevel', 'modulationRateHz', 'modulationDepthMs'].includes(key)) throw new TypeError(`Unknown reverb parameter: ${key}`);
    validate('roomSize', next.roomSize, 0, 0.98);
    validate('damping', next.damping, 0, 1);
    validate('mix', next.mix, 0, 1);
    validate('width', next.width, 0, 1);
    validate('preDelayMs', next.preDelayMs, 0, 200);
    validate('earlyLevel', next.earlyLevel, 0, 1);
    validate('modulationRateHz', next.modulationRateHz, 0.05, 2);
    validate('modulationDepthMs', next.modulationDepthMs, 0, 2);
    this.roomSize = next.roomSize;
    this.damping = next.damping;
    this.mix = next.mix;
    this.width = next.width;
    this.preDelayMs = next.preDelayMs;
    this.earlyLevel = next.earlyLevel;
    this.modulationRateHz = next.modulationRateHz;
    this.modulationDepthMs = next.modulationDepthMs;
    const predelaySamples = Math.round((this.preDelayMs / 1000) * this.sampleRate);
    this.preDelayLeft.setDelay(predelaySamples);
    this.preDelayRight.setDelay(predelaySamples);
    return this.getParameters();
  }

  process(left, right = left, { bypass = false } = {}) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) {
      throw new TypeError('StereoReverb expects matching Float32Array channel buffers.');
    }
    const feedback = 0.18 + (this.roomSize * 0.78);
    const wetGain = 0.25;
    const wet1 = (this.width * 0.5) + 0.5;
    const wet2 = (1 - this.width) * 0.5;
    const modulationDepthSamples = (this.modulationDepthMs / 1000) * this.sampleRate;
    const phaseIncrement = (Math.PI * 2 * this.modulationRateHz) / this.sampleRate;
    for (let i = 0; i < left.length; i += 1) {
      const modulation = Math.sin(this.modulationPhase);
      const dryL = left[i];
      const dryR = right[i];
      const predelayedL = this.preDelayLeft.process(dryL);
      const predelayedR = this.preDelayRight.process(dryR);
      let earlyL = 0;
      let earlyR = 0;
      for (let tap = 0; tap < this.earlyLeft.length; tap += 1) {
        earlyL += this.earlyLeft[tap].process(predelayedL) * EARLY_GAINS[tap];
        earlyR += this.earlyRight[tap].process(predelayedR) * EARLY_GAINS[tap];
      }
      const crossEarlyL = this.crossEarlyLeft.process(predelayedR) * 0.12;
      const crossEarlyR = this.crossEarlyRight.process(predelayedL) * 0.12;
      earlyL += crossEarlyL;
      earlyR += crossEarlyR;
      let reverberantL = 0;
      let reverberantR = 0;
      for (let comb = 0; comb < this.combsLeft.length; comb += 1) {
        reverberantL += this.combsLeft[comb].process(predelayedL, feedback, this.damping);
        reverberantR += this.combsRight[comb].process(predelayedR, feedback, this.damping);
      }
      reverberantL *= 0.25;
      reverberantR *= 0.25;
      for (let stage = 0; stage < this.allpassLeft.length; stage += 1) {
        reverberantL = this.allpassLeft[stage].process(reverberantL, modulation * modulationDepthSamples);
        reverberantR = this.allpassRight[stage].process(reverberantR, Math.sin(this.modulationPhase + 0.73 + (stage * 0.61)) * modulationDepthSamples);
      }
      const rawWetL = (reverberantL * wetGain) + (earlyL * this.earlyLevel * 0.5);
      const rawWetR = (reverberantR * wetGain) + (earlyR * this.earlyLevel * 0.5);
      const wetL = (rawWetL * wet1) + (rawWetR * wet2);
      const wetR = (rawWetR * wet1) + (rawWetL * wet2);
      left[i] = bypass ? dryL : (dryL * (1 - this.mix)) + (wetL * this.mix);
      if (right !== left) right[i] = bypass ? dryR : (dryR * (1 - this.mix)) + (wetR * this.mix);
      this.modulationPhase += phaseIncrement;
      if (this.modulationPhase >= Math.PI * 2) this.modulationPhase -= Math.PI * 2;
    }
    return { left, right };
  }

  reset() {
    this.modulationPhase = 0;
    for (const line of [...this.combsLeft, ...this.combsRight, ...this.allpassLeft, ...this.allpassRight, this.preDelayLeft, this.preDelayRight, ...this.earlyLeft, ...this.earlyRight, this.crossEarlyLeft, this.crossEarlyRight]) line.reset();
  }
}
