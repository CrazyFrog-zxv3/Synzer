# SYNZER · Layered Synth Workbench

SYNZER is an experimental browser-based instrument with a touch-oriented interface and a separate AudioWorklet DSP engine.

## Current release state

- DSP engine baseline: **0.2.0**
- Interface: **UI Foundation 0.1.0**
- Deployment: GitHub Pages, automatically published from the main branch.

## Browser demo

Open the instrument at:

https://crazyfrog-zxv3.github.io/Synzer/

The static entry point is index.html. It loads main.js, the Web Audio API controller at packages/dsp-engine/src/core/SynzerEngine.js, and the AudioWorklet processor at packages/dsp-engine/src/worklets/synzer-processor.js.

## Implemented

- Sine, PolyBLEP saw and PolyBLEP square oscillators.
- ADSR amplitude envelope.
- Up to 12 simultaneous voices.
- AudioWorklet-based rendering.
- Touch keyboard with pointer capture and multitouch.
- Responsive module navigation, waveform scope illustration and ADSR curve visualization.
- UI states for future Matrix, Modifiers and Global modules, explicitly marked as not implemented.

## Design direction

The interface is guided primarily by FRMS, complemented by G-Stomper VA-Beast and ToneBoosters Flowtones. The goal is a layered, mobile-first sound-design workbench with clear module navigation and a dedicated performance zone.

See [docs/DESIGN-DIRECTION.md](docs/DESIGN-DIRECTION.md) for the visual principles, current implementation boundary and next milestones.

## Important implementation boundary

The visual waveform scope is a schematic illustration of the selected oscillator shape, not a live audio analyzer.

The current DSP engine is still a basic virtual-analog core: one oscillator per voice, three waveforms, ADSR, up to 12 voices and AudioWorklet rendering. Granular synthesis, four real synthesis layers, dual oscillators, filters, FM, modulation matrix, LFOs, arpeggiator/sequencer, effects, unison, patch save/load, MIDI I/O and sample import/recording are **not implemented yet**. Future UI panels are labeled accordingly and do not claim to process audio.

## Validation boundary

The original 0.2.0 source archive passed 19 automated Node.js tests in the local environment. That does not establish Android device compatibility, latency, or sound quality on the POCO. The GitHub Actions Pages workflow validates the deployed static entry points and JavaScript syntax; physical-device audio testing remains outstanding.

The Android/Termux launcher and full original test/documentation package remain in the local source archive.
