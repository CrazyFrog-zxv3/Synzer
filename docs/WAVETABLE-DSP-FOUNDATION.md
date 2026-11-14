# SYNZER — Wavetable DSP foundation

Status: implemented as a tested DSP primitive; not yet a playable synthesis engine.

## Scope

This increment introduces the first reusable wavetable building block without changing the existing Virtual Analog voice path or claiming Wavetable engine availability.

## Components

`packages/dsp-engine/src/core/WavetableOscillator.js`

- `WavetableBank` owns immutable copies of one or more single-cycle `Float32Array` frames.
- All frames have the same power-of-two table length (minimum 4 samples).
- `sample(phase, morph)` wraps phase, linearly interpolates adjacent samples and linearly morphs between adjacent frames.
- `getFrame(index)` returns a defensive copy.
- `WavetableOscillator` owns per-instance phase, sample rate, frequency and morph position. It supports phase reset, live frequency/morph changes and rendering into a caller-owned `Float32Array`.
- `createHarmonicWavetable()` generates a normalized periodic frame from sinusoidal partials.

## Safety and numerical constraints

- Sample rate must be at least 8 kHz.
- Frequency is limited to 45% of sample rate.
- Morph position is bounded to `[0, 1]`.
- Non-finite table samples, phases, frequencies and amplitudes are rejected.
- The render path does not allocate per sample.

## Explicit limitations

- This is not yet registered as an available EngineRegistry family.
- It is not connected to SynzerEngine, AudioWorklet, VoiceEngine, modulation matrix, patch schema or UI.
- Linear interpolation is used for phase and frame morphing.
- Band-limited mip tables, pitch-aware table selection, anti-aliasing validation, sample import, multi-frame authoring and per-voice engine integration remain pending.
- No Android/ARM64 performance or device audio validation has been performed.

## Verification

`packages/dsp-engine/test/WavetableOscillator.test.js` covers phase interpolation/wrap, frame morphing, input validation, defensive ownership, phase accumulation, live parameter changes, finite rendering and harmonic table normalization.

The existing Virtual Analog engine and public Pages build remain unchanged by this increment.

## Band-limited mip levels — increment 2

`WavetableMipBank` and `createHarmonicWavetableMipBank()` add a frequency-aware family of band-limited tables generated from harmonic partial definitions.

- Each level contains only partials up to its declared harmonic ceiling. Ceilings grow geometrically (1, 2, 4, 8, …), with the exact highest partial retained when it is not a power of two.
- A bank may contain multiple partial frames; frame morphing is preserved at every mip level.
- All levels for a frame share the normalization reference of the full-band frame. This avoids unintended gain pumping when the oscillator changes levels.
- `select(frequency, sampleRate, nyquistMargin = 0.9)` chooses the richest level whose highest harmonic remains at or below the configured fraction of Nyquist. The oscillator retains the selection and updates it when frequency changes.
- On a level change, the oscillator crossfades from the previous level to the target over 64 rendered samples. The transition is per oscillator instance; it does not allocate a buffer per sample.
- The default 0.9 margin is a conservative guard band, not a universal psychoacoustic threshold. Applications can call `select()` with another margin in `(0, 1]`.

### Validation added

- Mip ceilings and pitch selection at 44.1 kHz and 48 kHz.
- Harmonic removal verified with a coherent 6 kHz / 48 kHz render and a DFT-bin check.
- Multi-frame morph support, shared normalization, finite output and level-transition continuity.

### Remaining limitations

- The mip generator currently accepts harmonic partial definitions, not arbitrary imported audio frames. Arbitrary sample-to-mipmap conversion needs a spectral analysis/resampling path.
- The geometric ceiling set is intentionally conservative and can discard partials that would still fit below Nyquist.
- Crossfade length is fixed at 64 samples and is not yet exposed as a patch/engine parameter.
- No per-sample frequency modulation integration, VoiceEngine/AudioWorklet integration, ARM64 benchmark or physical Android test has been performed.
- Wavetable remains `planned` in EngineRegistry and is not yet a playable instrument family.
