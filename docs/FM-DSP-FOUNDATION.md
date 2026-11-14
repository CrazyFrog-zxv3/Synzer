# SYNZER — FM / Phase Modulation Foundation

**Status:** implemented and integrated in the development branch  
**Engine:** `FMVoiceEngine`  
**Runtime:** AudioWorklet via `EngineRegistry`  
**Patch family:** `engineId: fm`

## Implemented signal model

The engine has four independent sine operators per voice. Each operator owns a phase accumulator and an ADSR envelope. Operator frequency is the played note frequency multiplied by its ratio. The modulator's level and index scale the phase deviation delivered to its target operator.

| Algorithm | Routing | Carriers |
|---|---|---|
| 1 | OP4 → OP3 → OP2 → OP1 | OP1 |
| 2 | OP2 → OP1 and OP4 → OP3 | OP1, OP3 |
| 3 | OP2 + OP3 → OP1; OP4 independent | OP1, OP4 |
| 4 | Four independent operators | OP1–OP4 |

OP4 supports one-sample feedback. Each operator exposes ratio, level, modulation index, and independent attack, decay, sustain and release. The global master level is shared with the main instrument control.

## Integration

- `EngineRegistry` reports FM/PM as available and constructs `FMVoiceEngine`.
- `synzer-processor` accepts `engineId` at construction and `SET_ENGINE` at runtime.
- `SynzerEngine` stores FM parameters separately from Virtual Analog parameters.
- SOURCE BANK exposes the engine selector and four operator modules.
- FM patches use the existing versioned patch envelope and persist the engine ID, global level and operator parameters.
- Switching engines releases held keyboard pointers before changing the AudioWorklet engine.

## Validation

- Unit tests cover finite stereo output, algorithm/ratio/index changes without phase reset, envelope release, parameter bounds and polyphonic runtime construction.
- AudioWorklet tests cover FM at construction and live switching from Virtual Analog.
- Chromium smoke covers keyboard-triggered FM notes, live control changes, patch save/load and 360×800 / 800×360 layouts.
- A local 12-voice benchmark uses 48 kHz, 128-frame blocks, 2,000 warm-up blocks and 10,000 measured blocks. Run `npm run bench:fm` to reproduce on the current host. One Linux x64 / Node 22 run measured mean 0.16774 ms and p95 0.17987 ms per block, or 6.75% of the 2.66667 ms block budget. This is a host benchmark only, not an Android performance guarantee.

## Known limitations

- The current FM output is centered mono duplicated to L/R. Dedicated stereo modulation/panning is not implemented.
- FM does not yet share the Virtual Analog TPT filter, LFO/modulation matrix, Unison, Noise or effects rack. The FM engine has its own per-operator ADSRs and global master level.
- The operators are sine-based. No oversampling or dedicated FM anti-aliasing stage is implemented; extreme index/ratio combinations can generate sidebands above Nyquist.
- The browser/CI and benchmark results do not establish performance on the target Android handset. A physical-device test is still required.
