# SYNZER — Wavetable DSP foundation

Status: implemented as a tested DSP primitive; not yet a playable synthesis engine.

## Scope

This increment introduces the first reusable wavetable building block without changing the existing Virtual Analog voice path or claiming Wavetable engine availability.

## Components

\`packages/dsp-engine/src/core/WavetableOscillator.js\`

- \`WavetableBank\` owns immutable copies of one or more single-cycle \`Float32Array\` frames.
- All frames have the same power-of-two table length (minimum 4 samples).
- \`sample(phase, morph)\` wraps phase, linearly interpolates adjacent samples and linearly morphs between adjacent frames.
- \`getFrame(index)\` returns a defensive copy.
- \`WavetableOscillator\` owns per-instance phase, sample rate, frequency and morph position. It supports phase reset, live frequency/morph changes and rendering into a caller-owned \`Float32Array\`.
- \`createHarmonicWavetable()\` generates a normalized periodic frame from sinusoidal partials.

## Safety and numerical constraints

- Sample rate must be at least 8 kHz.
- Frequency is limited to 45% of sample rate.
- Morph position is bounded to \`[0, 1]\`.
- Non-finite table samples, phases, frequencies and amplitudes are rejected.
- The render path does not allocate per sample.

## Explicit limitations

- This is not yet registered as an available EngineRegistry family.
- It is not connected to SynzerEngine, AudioWorklet, VoiceEngine, modulation matrix, patch schema or UI.
- Linear interpolation is used for phase and frame morphing.
- Band-limited mip tables, pitch-aware table selection, anti-aliasing validation, sample import, multi-frame authoring and per-voice engine integration remain pending.
- No Android/ARM64 performance or device audio validation has been performed.

## Verification

\`packages/dsp-engine/test/WavetableOscillator.test.js\` covers phase interpolation/wrap, frame morphing, input validation, defensive ownership, phase accumulation, live parameter changes, finite rendering and harmonic table normalization.

The existing Virtual Analog engine and public Pages build remain unchanged by this increment.
