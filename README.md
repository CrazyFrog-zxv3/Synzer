# SYNZER · DSP Core Lab

Build experimental 0.2.0.

## Browser demo

The static entry point is `index.html`. It loads the touch keyboard from `main.js`, the Web Audio API controller from `packages/dsp-engine/src/core/SynzerEngine.js`, and the AudioWorklet processor from `packages/dsp-engine/src/worklets/synzer-processor.js`.

## Included features

- Sine, PolyBLEP saw and PolyBLEP square oscillators.
- ADSR envelope and up to 12 voices.
- Multitouch keyboard using Pointer Events.
- AudioWorklet-based rendering.

## GitHub Pages

The deployment workflow is in `.github/workflows/pages.yml`. The first Pages activation must be completed once by the repository owner. See [PAGES-SETUP.md](PAGES-SETUP.md).

## Validation boundary

The 0.2.0 source archive passed 19 automated Node.js tests in the local environment. That does not establish browser playback, GitHub Pages deployment, Android latency, or POCO compatibility. Those require a successful hosted deployment and physical-device testing.

The Android/Termux launcher and full test/documentation package remain in the local source archive; this repository currently contains the static web demo and the engine modules needed by it.
