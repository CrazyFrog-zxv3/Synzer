# SYNZER FX Rack — routing foundation

**Status:** serial routing with configurable module order and per-module bypass is implemented on `feature/synth-filter-modes-v0.1.0`.

## Current signal path

`Synthesis engine → FX Rack → output`

The rack currently owns two persistent modules:

1. `delay` — Stereo Feedback Delay
2. `reverb` — Stereo Algorithm Reverb

The default order is Delay → Reverb. The user can switch to Reverb → Delay. Each module can be bypassed independently without clearing its internal delay/reverb memory or changing its parameter values. Bypass is transparent at the output, but the processor continues ingesting audio and advancing its feedback/diffusion state. This avoids frozen tails and stale-state jumps when re-enabled.

## Runtime contract

- `EffectRack` receives already-created processors and routes the same channel buffers through enabled modules in configured order.
- The process method validates matching `Float32Array` channel buffers and preserves mono operation.
- The audio callback does not allocate new channel buffers or routing arrays.
- Configuration updates are validated atomically. The order must contain `delay` and `reverb` exactly once; bypass flags must be booleans.
- `SynzerEngine.setEffectRackConfiguration()` stores settings before initialization and sends `SET_EFFECT_RACK` to the AudioWorklet when live.
- The worklet keeps the rack separate from synthesis-engine selection, so VA, Wavetable and FM share the same global effects bus.

## Patch format

Rack settings are stored in the global patch parameter map:

- `global.fx-rack-order`: `delay,reverb` or `reverb,delay`
- `global.fx-rack-delay-enabled`: boolean
- `global.fx-rack-reverb-enabled`: boolean

VA and FM patches both support these fields. Patches created before this feature receive safe defaults: Delay → Reverb, both enabled.

## User interface

The FILTER CHAMBER exposes PROCESS ORDER and independent enable switches for FX 01 and FX 02. Existing effect controls and DSP algorithms remain unchanged.

## Explicit limitations

This is a serial rack, not a modular patch-cable graph. Parallel sends/returns, per-slot gain, wet-only send architecture, feedback routing between modules, additional effect types, per-effect automation, modulation destinations and MIDI/host automation are not implemented. Parallel routing is intentionally deferred until a separate wet/dry contract and gain-compensation strategy can be tested without changing the current sound unexpectedly.

## Validation

- Unit tests cover order, bypass, invalid configuration atomicity and mono buffer behavior. Bypass-specific DSP tests verify that Delay continues writing its ring buffer and Reverb continues feeding its diffusion network while output remains dry.
- Integration tests cover engine API and AudioWorklet configuration messages.
- Patch tests cover VA/FM round-trip and legacy defaults.
- Browser smoke test verifies UI order/bypass, saving, changing and restoring the rack in an FM patch.
