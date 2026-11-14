const MIN_TABLE_SIZE = 4;

function wrapPhase(phase) {
  return ((phase % 1) + 1) % 1;
}

function validatePowerOfTwo(value, label) {
  if (!Number.isInteger(value) || value < MIN_TABLE_SIZE || (value & (value - 1)) !== 0) {
    throw new RangeError(label + ' must be a power of two of at least ' + MIN_TABLE_SIZE + '.');
  }
}

/** Immutable, single-cycle frames with linear phase and frame-position interpolation. */
export class WavetableBank {
  #frames;
  #size;
  #mask;

  constructor(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new TypeError('Wavetable bank requires at least one frame.');
    }
    const first = frames[0];
    if (!(first instanceof Float32Array) && !Array.isArray(first)) {
      throw new TypeError('Wavetable frames must be Float32Array or numeric arrays.');
    }
    this.#size = first.length;
    validatePowerOfTwo(this.#size, 'Wavetable frame length');
    this.#mask = this.#size - 1;
    this.#frames = frames.map((frame, frameIndex) => {
      if (!(frame instanceof Float32Array) && !Array.isArray(frame)) {
        throw new TypeError('Wavetable frame ' + frameIndex + ' must be a Float32Array or numeric array.');
      }
      if (frame.length !== this.#size) throw new RangeError('All wavetable frames must have the same length.');
      const copy = Float32Array.from(frame);
      for (const sample of copy) {
        if (!Number.isFinite(sample)) throw new TypeError('Wavetable samples must be finite numbers.');
      }
      return copy;
    });
  }

  get frameCount() { return this.#frames.length; }
  get tableSize() { return this.#size; }

  getFrame(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#frames.length) {
      throw new RangeError('Wavetable frame index is out of range.');
    }
    return this.#frames[index].slice();
  }

  sample(phase, morph = 0) {
    if (!Number.isFinite(phase)) throw new TypeError('Wavetable phase must be finite.');
    if (!Number.isFinite(morph) || morph < 0 || morph > 1) {
      throw new RangeError('Wavetable morph position must be between 0 and 1.');
    }
    const wrapped = wrapPhase(phase);
    const position = wrapped * this.#size;
    const index = Math.floor(position);
    const fraction = position - index;
    const nextIndex = (index + 1) & this.#mask;
    const framePosition = morph * (this.#frames.length - 1);
    const lowerFrame = Math.floor(framePosition);
    const upperFrame = Math.min(lowerFrame + 1, this.#frames.length - 1);
    const frameFraction = framePosition - lowerFrame;
    const lower = this.#frames[lowerFrame];
    const upper = this.#frames[upperFrame];
    const lowerSample = lower[index] + (lower[nextIndex] - lower[index]) * fraction;
    if (lowerFrame === upperFrame) return lowerSample;
    const upperSample = upper[index] + (upper[nextIndex] - upper[index]) * fraction;
    return lowerSample + (upperSample - lowerSample) * frameFraction;
  }
}

/** Per-voice wavetable playback state. Anti-alias mip levels are a separate future stage. */
export class WavetableOscillator {
  constructor({ bank, sampleRate, frequency = 440, phase = 0, morph = 0 } = {}) {
    if (!(bank instanceof WavetableBank)) throw new TypeError('WavetableOscillator requires a WavetableBank.');
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new RangeError('Sample rate must be at least 8000 Hz.');
    this.bank = bank;
    this.sampleRate = sampleRate;
    this.phase = 0;
    this.frequency = 0;
    this.morph = 0;
    this.reset(phase);
    this.setFrequency(frequency);
    this.setMorph(morph);
  }

  reset(phase = 0) {
    if (!Number.isFinite(phase)) throw new TypeError('Oscillator phase must be finite.');
    this.phase = wrapPhase(phase);
  }

  setFrequency(frequency) {
    if (!Number.isFinite(frequency) || frequency < 0 || frequency > this.sampleRate * 0.45) {
      throw new RangeError('Frequency must be between 0 and 45% of the sample rate.');
    }
    this.frequency = frequency;
  }

  setMorph(morph) {
    if (!Number.isFinite(morph) || morph < 0 || morph > 1) {
      throw new RangeError('Wavetable morph position must be between 0 and 1.');
    }
    this.morph = morph;
  }

  processSample() {
    const sample = this.bank.sample(this.phase, this.morph);
    this.phase += this.frequency / this.sampleRate;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    return sample;
  }

  render(output) {
    if (!(output instanceof Float32Array)) throw new TypeError('Wavetable output must be a Float32Array.');
    for (let index = 0; index < output.length; index += 1) output[index] = this.processSample();
    return output;
  }
}

/** Build a normalized periodic frame from a list of sinusoidal partials. */
export function createHarmonicWavetable({ size = 2048, partials } = {}) {
  validatePowerOfTwo(size, 'Wavetable size');
  if (!Array.isArray(partials) || partials.length === 0) {
    throw new TypeError('At least one harmonic partial is required.');
  }
  const normalizedPartials = partials.map(({ harmonic, amplitude }) => {
    if (!Number.isInteger(harmonic) || harmonic < 1 || harmonic > size / 2) {
      throw new RangeError('Harmonic number must be an integer within the table Nyquist limit.');
    }
    if (!Number.isFinite(amplitude)) throw new TypeError('Partial amplitude must be finite.');
    return { harmonic, amplitude };
  });
  const frame = new Float32Array(size);
  let peak = 0;
  for (let index = 0; index < size; index += 1) {
    const phase = (index / size) * Math.PI * 2;
    let value = 0;
    for (const partial of normalizedPartials) value += Math.sin(phase * partial.harmonic) * partial.amplitude;
    frame[index] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) {
    const scale = 1 / peak;
    for (let index = 0; index < size; index += 1) frame[index] *= scale;
  }
  return frame;
}
