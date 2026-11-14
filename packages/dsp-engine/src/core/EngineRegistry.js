import { VoiceEngine } from './VoiceEngine.js';
import { FMVoiceEngine } from './FMVoiceEngine.js';

const FAMILY_DEFINITIONS = [
  { id: 'virtual-analog', label: 'Virtual Analog', status: 'available', description: 'Subtractive synthesis with oscillators and envelopes.' },
  { id: 'wavetable', label: 'Wavetable', status: 'planned', description: 'Table scanning and spectral frame interpolation.' },
  { id: 'fm', label: 'FM / Phase Modulation', status: 'available', description: 'Four-operator frequency and phase modulation.' },
  { id: 'additive', label: 'Additive', status: 'planned', description: 'Harmonic partial synthesis.' },
  { id: 'sample', label: 'Sample / Multisample', status: 'planned', description: 'Playback and mapping of recorded audio.' },
  { id: 'granular', label: 'Granular', status: 'planned', description: 'Grain-based playback and texture generation.' },
  { id: 'spectral', label: 'Spectral', status: 'planned', description: 'Spectral processing and resynthesis.' },
  { id: 'physical-modeling', label: 'Physical Modeling', status: 'planned', description: 'Resonant and physically inspired sound models.' },
];

export const SYNTHESIS_FAMILIES = Object.freeze(
  FAMILY_DEFINITIONS.map((family) => Object.freeze({ ...family })),
);

/**
 * Runtime registry for instantiated synthesis engines.
 * Planned families remain catalog metadata until a tested factory is supplied.
 */
export class EngineRegistry {
  #engines = new Map();

  register({ id, label, status = 'available', create }) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new TypeError('Engine id must be a lowercase kebab-case identifier.');
    }
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new TypeError('Engine label must be a non-empty string.');
    }
    if (status !== 'available') {
      throw new Error('Only available engines can be registered for runtime use.');
    }
    if (typeof create !== 'function') {
      throw new TypeError('Engine factory must be a function.');
    }
    if (this.#engines.has(id)) {
      throw new Error(`Engine already registered: ${id}`);
    }

    const descriptor = Object.freeze({ id, label: label.trim(), status: 'available' });
    this.#engines.set(id, { descriptor, create });
    return descriptor;
  }

  has(id) {
    return this.#engines.has(id);
  }

  create(id, options = {}) {
    const entry = this.#engines.get(id);
    if (!entry) throw new Error(`Synthesis engine is not registered: ${id}`);
    return entry.create(options);
  }

  list() {
    return Object.freeze(
      [...this.#engines.values()].map(({ descriptor }) => descriptor),
    );
  }
}

/** Create the runtime registry with only engines that have a real implementation. */
export function createDefaultEngineRegistry() {
  const registry = new EngineRegistry();
  registry.register({
    id: 'virtual-analog',
    label: 'Virtual Analog',
    create: (options) => new VoiceEngine(options),
  });
  registry.register({
    id: 'fm',
    label: 'FM / Phase Modulation',
    create: (options) => new FMVoiceEngine(options),
  });
  return registry;
}
