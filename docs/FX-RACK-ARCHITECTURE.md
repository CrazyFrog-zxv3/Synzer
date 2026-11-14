# SYNZER FX Rack — serial and parallel routing

**Status:** serial insert routing and two-module parallel send/return routing are implemented on `feature/synth-filter-modes-v0.1.0`.

## Signal path

`Synthesis engine → FX Rack → output`

The rack owns two persistent processors:

1. `delay` — Stereo Feedback Delay
2. `reverb` — Stereo Algorithm Reverb

The default remains the original serial chain, Delay → Reverb. Reverb → Delay is also supported. In serial mode, the modules retain their original wet/dry behavior and configured order.

Parallel mode feeds an independent copy of the original dry signal to each effect. Each processor exposes a wet-only output path; the rack sums those returns with one separately controlled dry path. This avoids duplicating the dry signal once per effect. The order selector remains stored in parallel mode but does not create inter-effect routing there.

## Runtime contract

- `EffectRack` validates matching `Float32Array` channel buffers and preserves mono operation.
- Serial mode preserves the established processing contract.
- Parallel mode owns reusable sum and branch scratch buffers. They are allocated on the first block or when block size changes, not per sample or per steady-state block.
- Each effect receives the original dry input multiplied by its own send level. Its wet-only output is multiplied by its return level and added to the wet bus.
- A bypassed module still processes its input and advances delay/feedback/diffusion state, but its return is omitted.
- Configuration updates are validated atomically. Mode is `serial` or `parallel`; order contains both modules exactly once; bypass flags are booleans; send/return and dry/wet gains are finite values from 0 to 2.
- `SynzerEngine.setEffectRackConfiguration()` stores settings before initialization and sends `SET_EFFECT_RACK` to the AudioWorklet when live.
- The worklet keeps the rack separate from synthesis-engine selection, so VA, Wavetable and FM share the same global effects bus.

### Parallel gain budget

The parallel bus uses the deterministic coefficient:

`normalization = 1 / max(1, dryLevel + wetLevel × Σ(send × return))`

The coefficient scales the dry and wet contributions together so their declared unity-gain budget does not grow merely because another send is enabled. It is gain-budget compensation, not a brickwall limiter or a true-peak guarantee: an effect can generate internal peaks above unity, and downstream output protection is not implemented.

## Patch format

Rack settings are stored in the global patch parameter map:

- `global.fx-rack-mode`: `serial` or `parallel`
- `global.fx-rack-order`: `delay,reverb` or `reverb,delay`
- `global.fx-rack-delay-enabled`, `global.fx-rack-reverb-enabled`: booleans
- `global.fx-rack-delay-send`, `global.fx-rack-delay-return`
- `global.fx-rack-reverb-send`, `global.fx-rack-reverb-return`
- `global.fx-rack-dry-level`, `global.fx-rack-wet-level`

VA and FM patches persist the complete rack configuration. Older patches without these fields restore the safe serial defaults, with both modules enabled and all levels at unity.

## User interface

The FILTER CHAMBER exposes routing mode, serial order, independent module enable switches, Delay/Reverb sends and returns, and global dry/wet bus levels. The controls are connected to the live engine and round-trip through saved patches.

## Explicit limitations

- Parallel routing currently supports the two built-in effects only.
- No arbitrary modular graph, feedback routing between effects, sidechain/ducking, per-effect automation, modulation destinations, MIDI/host automation, BPM sync or convolution/IR loading.
- The headroom coefficient is not a limiter. Peak protection and loudness-matched auditioning remain future work.
- Reverb remains algorithmic, not convolutional or geometrically modeled.

## Validation

- Unit tests cover serial ordering, bypass state continuity, parallel wet-only summing, independent sends/returns, gain-budget normalization, invalid configuration atomicity, mono buffers and repeated block processing.
- Integration tests exercise real Delay/Reverb processors and AudioWorklet parallel routing.
- Patch tests cover VA/FM round-trip, parallel settings and legacy defaults.
- Chromium smoke test exercises mode switching, all six gain controls, FM audio, patch save/change/restore and responsive viewports.
