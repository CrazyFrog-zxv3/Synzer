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

/** Immutable set of band-limited frames ordered by increasing harmonic ceiling. */
export class WavetableMipBank {
  #levels;
  #frameCount;
  #tableSize;

  constructor(levels) {
    if (!Array.isArray(levels) || levels.length === 0) throw new TypeError('Wavetable mip bank requires at least one level.');
    let previousCeiling = 0;
    const firstBank = levels[0]?.bank;
    if (!(firstBank instanceof WavetableBank)) throw new TypeError('Each mip level requires a WavetableBank.');
    this.#frameCount = firstBank.frameCount;
    this.#tableSize = firstBank.tableSize;
    this.#levels = levels.map((level, index) => {
      if (!level || !(level.bank instanceof WavetableBank)) throw new TypeError('Each mip level requires a WavetableBank.');
      if (!Number.isInteger(level.maxHarmonic) || level.maxHarmonic < 1 || level.maxHarmonic <= previousCeiling) {
        throw new RangeError('Mip harmonic ceilings must be strictly increasing positive integers.');
      }
      if (level.bank.frameCount !== this.#frameCount || level.bank.tableSize !== this.#tableSize) {
        throw new RangeError('All mip levels must have matching frame counts and table sizes.');
      }
      previousCeiling = level.maxHarmonic;
      return Object.freeze({ maxHarmonic: level.maxHarmonic, bank: level.bank });
    });
    Object.freeze(this.#levels);
  }

  get levels() { return this.#levels.map(({ maxHarmonic }) => Object.freeze({ maxHarmonic })); }
  get frameCount() { return this.#frameCount; }
  get tableSize() { return this.#tableSize; }

  selectLevelIndex(frequency, sampleRate, nyquistMargin = 0.9) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new RangeError('Sample rate must be at least 8000 Hz.');
    if (!Number.isFinite(frequency) || frequency < 0 || frequency > sampleRate * 0.45) {
      throw new RangeError('Frequency must be between 0 and 45% of the sample rate.');
    }
    if (!Number.isFinite(nyquistMargin) || nyquistMargin <= 0 || nyquistMargin > 1) {
      throw new RangeError('Nyquist margin must be greater than 0 and at most 1.');
    }
    const safeHarmonics = frequency === 0 ? Infinity : (sampleRate * 0.5 * nyquistMargin) / frequency;
    let levelIndex = 0;
    for (let index = 0; index < this.#levels.length; index += 1) {
      if (this.#levels[index].maxHarmonic > safeHarmonics) break;
      levelIndex = index;
    }
    return levelIndex;
  }

  select(frequency, sampleRate, nyquistMargin = 0.9) {
    const levelIndex = this.selectLevelIndex(frequency, sampleRate, nyquistMargin);
    const maxHarmonic = this.#levels[levelIndex].maxHarmonic;
    const safeHarmonics = frequency === 0 ? Infinity : (sampleRate * 0.5 * nyquistMargin) / frequency;
    return { levelIndex, maxHarmonic, safeHarmonics };
  }

  sampleLevel(phase, morph, levelIndex) {
    if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= this.#levels.length) {
      throw new RangeError('Wavetable mip level index is out of range.');
    }
    return this.#levels[levelIndex].bank.sample(phase, morph);
  }

  sample(phase, morph = 0, selection = null) {
    const chosen = selection || this.select(0, 48000);
    return this.sampleLevel(phase, morph, chosen.levelIndex);
  }
}

/** Build power-of-two band-limited mip levels from one or more harmonic frame definitions. */
export function createHarmonicWavetableMipBank({ size = 2048, partials, partialFrames } = {}) {
  validatePowerOfTwo(size, 'Wavetable size');
  const frames = partialFrames === undefined ? [partials] : partialFrames;
  if (!Array.isArray(frames) || frames.length === 0 || frames.some((frame) => !Array.isArray(frame) || frame.length === 0)) {
    throw new TypeError('At least one non-empty harmonic partial frame is required.');
  }
  const validatedFrames = frames.map((frame) => {
    const validated = frame.map(({ harmonic, amplitude }) => {
      if (!Number.isInteger(harmonic) || harmonic < 1 || harmonic > size / 2) {
        throw new RangeError('Harmonic number must be an integer within the table Nyquist limit.');
      }
      if (!Number.isFinite(amplitude)) throw new TypeError('Partial amplitude must be finite.');
      return { harmonic, amplitude };
    });
    return validated;
  });
  const highestHarmonic = Math.max(...validatedFrames.flat().map(({ harmonic }) => harmonic));
  const ceilings = [];
  for (let ceiling = 1; ceiling < highestHarmonic; ceiling *= 2) ceilings.push(ceiling);
  if (ceilings.length === 0 || ceilings[ceilings.length - 1] !== highestHarmonic) ceilings.push(highestHarmonic);
  const frameScales = validatedFrames.map((frame) => {
    const { peak } = renderHarmonicFrame(size, frame);
    return peak > 0 ? 1 / peak : 1;
  });
  const levels = ceilings.map((maxHarmonic) => ({
    maxHarmonic,
    bank: new WavetableBank(validatedFrames.map((frame, frameIndex) => {
      const { frame: rendered } = renderHarmonicFrame(size, frame.filter(({ harmonic }) => harmonic <= maxHarmonic));
      const scale = frameScales[frameIndex];
      for (let index = 0; index < rendered.length; index += 1) rendered[index] *= scale;
      return rendered;
    })),
  }));
  return new WavetableMipBank(levels);
}

/** Per-voice wavetable playback state with frequency-aware mip selection. */
export class WavetableOscillator {
  constructor({ bank, sampleRate, frequency = 440, phase = 0, morph = 0 } = {}) {
    if (!(bank instanceof WavetableBank) && !(bank instanceof WavetableMipBank)) throw new TypeError('WavetableOscillator requires a WavetableBank or WavetableMipBank.');
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new RangeError('Sample rate must be at least 8000 Hz.');
    this.bank = bank;
    this.sampleRate = sampleRate;
    this.phase = 0;
    this.frequency = 0;
    this.morph = 0;
    this.mipCurrentIndex = 0;
    this.mipTargetIndex = 0;
    this.mipFadeRemaining = 0;
    this.mipFadeSamples = 64;
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
    if (this.bank instanceof WavetableMipBank) {
      const selectionIndex = this.bank.selectLevelIndex(frequency, this.sampleRate);
      if (selectionIndex !== this.mipTargetIndex) {
        this.mipCurrentIndex = this.mipFadeRemaining > 0 ? this.mipTargetIndex : this.mipCurrentIndex;
        this.mipTargetIndex = selectionIndex;
        this.mipFadeRemaining = this.mipFadeSamples;
        if (this.mipCurrentIndex === this.mipTargetIndex) this.mipFadeRemaining = 0;
      }
    }
  }

  setMorph(morph) {
    if (!Number.isFinite(morph) || morph < 0 || morph > 1) {
      throw new RangeError('Wavetable morph position must be between 0 and 1.');
    }
    this.morph = morph;
  }

  processSample() {
    let sample;
    if (this.bank instanceof WavetableMipBank) {
      if (this.mipFadeRemaining > 0) {
        const oldSample = this.bank.sampleLevel(this.phase, this.morph, this.mipCurrentIndex);
        const newSample = this.bank.sampleLevel(this.phase, this.morph, this.mipTargetIndex);
        const mix = (this.mipFadeSamples - this.mipFadeRemaining) / (this.mipFadeSamples - 1);
        sample = oldSample + (newSample - oldSample) * mix;
        this.mipFadeRemaining -= 1;
        if (this.mipFadeRemaining === 0) this.mipCurrentIndex = this.mipTargetIndex;
      } else {
        sample = this.bank.sampleLevel(this.phase, this.morph, this.mipTargetIndex);
        this.mipCurrentIndex = this.mipTargetIndex;
      }
    } else {
      sample = this.bank.sample(this.phase, this.morph);
    }
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

function renderHarmonicFrame(size, partials) {
  const frame = new Float32Array(size);
  let peak = 0;
  for (let index = 0; index < size; index += 1) {
    const phase = (index / size) * Math.PI * 2;
    let value = 0;
    for (const partial of partials) value += Math.sin(phase * partial.harmonic) * partial.amplitude;
    frame[index] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  return { frame, peak };
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
  const { frame, peak } = renderHarmonicFrame(size, normalizedPartials);
  if (peak > 0) {
    const scale = 1 / peak;
    for (let index = 0; index < size; index += 1) frame[index] *= scale;
  }
  return frame;
}
