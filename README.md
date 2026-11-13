# SYNZER · DSP Core Lab

Experimental browser build 0.2.0.

## Browser demo

The static demo entry point is `index.html`. It loads the touch keyboard from `main.js`, the Web Audio API controller from `packages/dsp-engine/src/core/SynzerEngine.js`, and the AudioWorklet processor from `packages/dsp-engine/src/worklets/synzer-processor.js`.

## Included features

- Sine, PolyBLEP saw and PolyBLEP square oscillators.
- ADSR envelope and up to 12 voices.
- Multitouch keyboard using Pointer Events.
- AudioWorklet-based rendering.

## Validation boundary

This repository upload has not yet been verified in a real browser session or on a physical Android device. Automated Node tests and the local benchmark from the working package are not represented as GitHub Pages or device validation. Audio output, latency, stability and POCO compatibility remain unverified.

The Android/Termux launcher and full test/documentation package are not part of this initial Pages deployment.
