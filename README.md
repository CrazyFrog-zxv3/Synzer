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

- Virtual Analog com sine, PolyBLEP saw/square, OSC 02, Sub, Noise branco/rosa e Unison estéreo.
- Wavetable com morph, banco harmônico mip-mapped e transições entre níveis.
- FM/PM de quatro operadores, quatro algoritmos e envelopes independentes por operador.
- Até 12 vozes, três envelopes por voz, LFO e matriz de modulação com destinos de pitch e cutoff.
- Filtro TPT multimodo por voz e barramento global pós-motor com FX 01 Stereo Feedback Delay e FX 02 Stereo Algorithm Reverb.
- AudioWorklet, teclado multitouch, persistência local de patches VA/FM/Wavetable e interface responsiva com fullscreen. Patches VA/FM armazenam parâmetros dos FX 01/02 e a configuração do FX Rack.

## Design direction

The interface is guided primarily by FRMS, complemented by G-Stomper VA-Beast and ToneBoosters Flowtones. The goal is a layered, mobile-first sound-design workbench with clear module navigation and a dedicated performance zone.

See [docs/DESIGN-DIRECTION.md](docs/DESIGN-DIRECTION.md) for the visual principles, [docs/FM-DSP-FOUNDATION.md](docs/FM-DSP-FOUNDATION.md) for FM limits, and [docs/FX-01-STEREO-DELAY.md](docs/FX-01-STEREO-DELAY.md) for FX 01 and [docs/FX-02-STEREO-REVERB.md](docs/FX-02-STEREO-REVERB.md) for the Reverb architecture, and [docs/FX-RACK-ARCHITECTURE.md](docs/FX-RACK-ARCHITECTURE.md) for the modular routing foundation.

## Important implementation boundary

The visual waveform scope is a schematic illustration of the selected oscillator shape, not a live audio analyzer.

The current engines are Virtual Analog, Wavetable and four-operator FM. Additive, granular, sample-based, spectral and physical-modeling engines remain planned. Os parâmetros do Delay e do Reverb são armazenados como parâmetros globais opcionais em patches v1; patches legados recebem defaults seguros. Arpeggiator, step sequencer, MIDI I/O, sample import/recording, convolução/IR, early reflections geometricamente modeladas, BPM sync, ducking e roteamento paralelo, sends/returns e conexões modulares livres permanecem trabalho futuro. O rack serial atual já permite inverter a ordem Delay/Reverb e bypass independente por módulo.

## Validation boundary

The original 0.2.0 source archive passed 19 automated Node.js tests in the local environment. That does not establish Android device compatibility, latency, or sound quality on the POCO. The GitHub Actions Pages workflow validates the deployed static entry points and JavaScript syntax; physical-device audio testing remains outstanding.

The Android/Termux launcher and full original test/documentation package remain in the local source archive.

### Global FX bus

- FX 01 Stereo Feedback Delay: tempo fracionário, feedback bipolar, wet/dry e ping-pong.
- FX 02 Stereo Algorithm Reverb: predelay de 0–200 ms, reflexões iniciais estéreo independentes e cauda Schroeder com quatro combs amortecidos, duas etapas all-pass por canal e modulação lenta interpolada opcional.
- Ambos os efeitos rodam após o motor de síntese no AudioWorklet e seus parâmetros são persistidos em patches VA/FM. O FX Rack permite ordem serial configurável e bypass independente, também persistidos nos patches.
- Limitação: o Reverb atual não é convolutivo e não carrega IRs.
