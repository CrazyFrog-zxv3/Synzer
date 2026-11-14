const FILTER_MODES = new Set(['off', 'lowpass', 'highpass', 'bandpass']);

const TPT_G_TABLE_STEPS = 16384;
const TPT_G_TABLE = new Float64Array(TPT_G_TABLE_STEPS + 1);
for (let index = 0; index <= TPT_G_TABLE_STEPS; index++) {
  const normalizedFrequency = (index / TPT_G_TABLE_STEPS) * 0.45;
  TPT_G_TABLE[index] = Math.tan(Math.PI * normalizedFrequency);
}

function lookupTptG(frequency, sampleRate) {
  const normalizedFrequency = Math.min(frequency / sampleRate, 0.45);
  const position = (normalizedFrequency / 0.45) * TPT_G_TABLE_STEPS;
  const lowerIndex = Math.min(TPT_G_TABLE_STEPS - 1, Math.floor(position));
  const fraction = position - lowerIndex;
  const lower = TPT_G_TABLE[lowerIndex];
  const upper = TPT_G_TABLE[lowerIndex + 1];
  return lower + ((upper - lower) * fraction);
}

function assertRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

/**
 * Topology-preserving-transform (TPT) state-variable filter.
 * The integrator state is retained when coefficients change, avoiding a reset
 * click during ordinary cutoff/resonance automation.
 */
export class TptStateVariableFilter {
  constructor({ sampleRate, mode = 'off', cutoff = 12000, resonance = Math.SQRT1_2 } = {}) {
    assertRange('sampleRate', sampleRate, 8000, 384000);
    this.sampleRate = sampleRate;
    this.ic1eq = 0;
    this.ic2eq = 0;
    this.mode = 'off';
    this.cutoff = 12000;
    this.resonance = Math.SQRT1_2;
    this.a1 = 1;
    this.a2 = 0;
    this.a3 = 0;
    this.k = 1 / Math.SQRT1_2;
    this.setParameters({ mode, cutoff, resonance });
  }

  getState() {
    return { ic1eq: this.ic1eq, ic2eq: this.ic2eq };
  }

  setParameters(values = {}) {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('Filter parameters must be an object.');
    }
    const mode = values.mode ?? this.mode;
    const cutoff = values.cutoff ?? this.cutoff;
    const resonance = values.resonance ?? this.resonance;
    if (!FILTER_MODES.has(mode)) throw new TypeError('Filter mode must be off, lowpass, highpass, or bandpass.');
    assertRange('cutoff', cutoff, 20, 20000);
    assertRange('resonance', resonance, 0.5, 12);

    this.mode = mode;
    this.cutoff = cutoff;
    this.resonance = resonance;
    this.#updateCoefficients();
    return this.getParameters();
  }

  setCutoff(cutoff) {
    assertRange('cutoff', cutoff, 20, 20000);
    if (cutoff === this.cutoff) return this.cutoff;
    this.cutoff = cutoff;
    this.#updateCoefficients();
    return this.cutoff;
  }

  #updateCoefficients() {
    const frequency = Math.min(this.cutoff, this.sampleRate * 0.45);
    const g = lookupTptG(frequency, this.sampleRate);
    this.k = 1 / this.resonance;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  getParameters() {
    return { mode: this.mode, cutoff: this.cutoff, resonance: this.resonance };
  }

  reset() {
    this.ic1eq = 0;
    this.ic2eq = 0;
  }

  process(input) {
    if (!Number.isFinite(input)) throw new TypeError('Filter input must be finite.');
    if (this.mode === 'off') return input;

    const v3 = input - this.ic2eq;
    const v1 = (this.a1 * this.ic1eq) + (this.a2 * v3);
    const v2 = this.ic2eq + (this.a2 * this.ic1eq) + (this.a3 * v3);
    this.ic1eq = (2 * v1) - this.ic1eq;
    this.ic2eq = (2 * v2) - this.ic2eq;

    let output;
    if (this.mode === 'lowpass') output = v2;
    else if (this.mode === 'highpass') output = input - (this.k * v1) - v2;
    else output = v1;

    if (!Number.isFinite(output) || !Number.isFinite(this.ic1eq) || !Number.isFinite(this.ic2eq)) {
      this.reset();
      return 0;
    }
    return output;
  }
}
