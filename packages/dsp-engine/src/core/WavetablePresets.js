const partial = (harmonic, amplitude) => Object.freeze({ harmonic, amplitude });

export const DEFAULT_WAVETABLE_PARTIAL_FRAMES = Object.freeze([
  Object.freeze([partial(1, 1)]),
  Object.freeze([
    partial(1, 1), partial(2, 0.42), partial(3, 0.2), partial(4, 0.1),
    partial(5, 0.06), partial(6, 0.04), partial(8, 0.025),
  ]),
  Object.freeze(Array.from({ length: 32 }, (_, index) => partial(index + 1, 1 / (index + 1)))),
]);

export function createDefaultWavetableDefinition(morph = 0) {
  if (!Number.isFinite(morph) || morph < 0 || morph > 1) {
    throw new RangeError('Default Wavetable morph must be between 0 and 1.');
  }
  return {
    size: 2048,
    morph,
    partialFrames: DEFAULT_WAVETABLE_PARTIAL_FRAMES,
  };
}
