const NOISE_COLORS = new Set(['white', 'pink']);

/** Deterministic per-voice noise source with white and filtered pink-noise modes. */
export class NoiseGenerator {
  constructor({ seed = 1, color = 'white' } = {}) {
    if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) {
      throw new RangeError('Noise seed must be a non-zero uint32.');
    }
    if (!NOISE_COLORS.has(color)) throw new RangeError(`Unsupported noise color: ${color}`);
    this.seed = seed >>> 0;
    this.color = color;
    this.pinkState = new Float64Array(7);
  }

  setColor(color) {
    if (!NOISE_COLORS.has(color)) throw new RangeError(`Unsupported noise color: ${color}`);
    this.color = color;
    return this.color;
  }

  #whiteSample() {
    let value = this.seed;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.seed = value >>> 0;
    return (this.seed / 0xffffffff) * 2 - 1;
  }

  nextSample() {
    const white = this.#whiteSample();
    if (this.color === 'white') return white;

    const state = this.pinkState;
    state[0] = (0.99886 * state[0]) + (white * 0.0555179);
    state[1] = (0.99332 * state[1]) + (white * 0.0750759);
    state[2] = (0.96900 * state[2]) + (white * 0.1538520);
    state[3] = (0.86650 * state[3]) + (white * 0.3104856);
    state[4] = (0.55000 * state[4]) + (white * 0.5329522);
    state[5] = (-0.7616 * state[5]) - (white * 0.0168980);
    const pink = (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] +
      (state[6] * 0.115926) + (white * 0.5362)) * 0.11;
    state[6] = white;
    return Math.max(-1, Math.min(1, pink));
  }
}
