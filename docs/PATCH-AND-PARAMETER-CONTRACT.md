# Synzer Patch and Parameter Contract

Status: implemented as a first schema layer; not yet connected to the instrument UI or persistent preset storage.

## Scope

This contract establishes stable parameter identities and a versioned patch container. It deliberately separates global parameters from parameters owned by a specific engine slot. It does not claim that every listed synthesis family has a runtime engine.

## Parameter definitions

Module: `packages/dsp-engine/src/core/PatchSchema.js`

A parameter definition uses:

- `id`: stable, namespaced identifier. Global IDs use `global.<parameter>`; engine IDs use `engine.<engine-id>.<parameter>`.
- `type`: `number`, `boolean`, or `enum`.
- `defaultValue`: a value matching the declared type.
- `min`, `max`, `step`: optional numeric metadata for number parameters.
- `choices`: required for enum parameters.
- `unit`: optional display/unit metadata.

Definitions are immutable. Numeric values must be finite and inside declared bounds. Enum values must match an explicit choice. Boolean values must be booleans. Validation rejects invalid values rather than silently clamping them.

`normalizeParameterValues(definitions, values)` fills missing values from defaults and rejects unknown parameter IDs.

## Patch schema v1

A patch has this shape:

```js
{
  schemaVersion: 1,
  name: 'Init',
  globalParameters: {
    'global.master-level': 0.8
  },
  engineSlots: [
    {
      slotId: 'layer-a',
      engineId: 'virtual-analog',
      enabled: true,
      parameters: {
        'engine.virtual-analog.osc-wave': 'saw'
      }
    }
  ]
}
```

The example is illustrative. Parameter values are not yet connected to DSP controls. The schema validates namespaces and primitive values, slot identity, engine identifier syntax, and version. Runtime availability remains the responsibility of EngineRegistry.

## Serialization

- `createPatch(input)` creates a normalized immutable v1 patch.
- `validatePatch(input)` validates and returns an immutable snapshot.
- `serializePatch(patch)` validates before JSON serialization.
- `deserializePatch(json)` parses and validates; malformed JSON and unsupported schema versions are rejected.

Unknown schema versions are rejected. No automatic migration is implemented yet. A future migration layer must be explicit and tested before old patch versions are rewritten.

## Current limitations

- No UI controls are bound to this contract.
- No patch browser, save/load storage, import/export UI, or autosave is implemented.
- No engine parameter definitions are currently registered by the live Virtual Analog engine.
- No automatic migration exists.
- The contract is not yet passed through the AudioWorklet or SynzerEngine runtime.
- The schema validates patch structure, not whether a particular engine is installed or can be instantiated.

## Verification

Unit tests are in `packages/dsp-engine/test/PatchSchema.test.js`. CI run for the implementation commit: pending at the time this document was authored; update this statement only after checking the workflow result.


## Virtual Analog parameter registry and runtime integration

Module: `packages/dsp-engine/src/core/VirtualAnalogParameters.js`

The first live parameter set is registered with stable IDs:

- `global.master-level`: linear gain from 0 to 1, default 1.
- `engine.virtual-analog.osc-wave`: `saw`, `square`, or `sine`, default `saw`.
- `engine.virtual-analog.amp-attack`: 0 to 30 seconds, default 0.01 s.
- `engine.virtual-analog.amp-decay`: 0 to 30 seconds, default 0.08 s.
- `engine.virtual-analog.amp-sustain`: 0 to 1, default 0.75.
- `engine.virtual-analog.amp-release`: 0 to 60 seconds, default 0.25 s.

These defaults preserve the previous VA envelope and oscillator defaults. Master level multiplies the existing per-voice gain, so its default of 1 does not change the previous output level.

### Runtime path

The UI reads the waveform, ADSR, and master level controls and calls `SynzerEngine.setParameters()`. The engine validates and stores a normalized immutable parameter snapshot. If the Worklet is not initialized, the values are retained and sent immediately after the node is created. Later updates are sent through `SET_PARAMETERS` messages. The AudioWorklet applies them to the live `VoiceEngine`.

- Master level is applied to all active voices on the next render quantum.
- Waveform and ADSR become defaults for newly triggered voices. Existing voices retain the waveform/envelope with which they started.
- NOTE_ON messages can still explicitly override waveform or envelope for compatibility with existing callers.
- Invalid updates are rejected by the DSP engine and surfaced as `ENGINE_ERROR`; the last valid parameter state remains active.

### Verification

Coverage includes parameter definition/defaults, normalization and rejection, VoiceEngine rendering, SynzerEngine pre-init and live message routing, Worklet application and rejection, and a real Chromium audio integration smoke test.

This is the first working parameter path, not a complete patch/preset system. Patch save/load, storage, UI preset management, migration, automation, modulation destinations and multi-engine mixing remain unimplemented.


## Local patch storage

Module: `packages/dsp-engine/src/core/PatchStore.js`

The first persistence adapter stores validated v1 patches in browser `localStorage` under `synzer.patches.v1`. The storage module receives a Storage-compatible object, so its behavior can be tested without a browser.

- `createVirtualAnalogPatch(parameters, name)` splits the current parameter snapshot into global and Virtual Analog engine-slot scopes.
- `savePatch(storage, patch)` validates and serializes a patch. Existing names are rejected case-insensitively rather than silently overwritten.
- `listPatches(storage)` returns saved patch names.
- `loadPatch(storage, name)` returns a validated patch.
- `applyVirtualAnalogPatch(patch)` validates runtime compatibility and produces the normalized parameter snapshot consumed by the engine.

The UI now exposes a patch name, Save Patch, saved-patch selector and Load action. Loading synchronizes waveform, ADSR and master-level controls and sends the restored parameters to the live engine. Saving is explicit; no automatic writes or destructive replacement are performed.

The current runtime intentionally accepts exactly one enabled Virtual Analog slot. Multi-engine patches are structurally representable by the schema but cannot be applied until the corresponding engines and mixer are implemented.

Persistence is local to the browser profile/device. It is not cloud sync, backup, or cross-device transfer. Clearing browser site data can remove these patches.


## TPT multimode filter runtime

Module: `packages/dsp-engine/src/core/TptStateVariableFilter.js`

The Virtual Analog voice signal path now includes a per-voice topology-preserving-transform state-variable filter (TPT SVF). It provides:

- `off`: exact input bypass.
- `lowpass`: second-order low-pass response.
- `highpass`: second-order high-pass response.
- `bandpass`: second-order band-pass response.

The filter uses the TPT integrator formulation with precomputed coefficients. Cutoff is constrained to 20–20,000 Hz and internally limited to 45% of the active sample rate to avoid operation at Nyquist. Resonance is represented as Q from 0.5 to 12. Coefficient changes retain the integrator state; they do not reset the filter on every automation update. Each voice owns independent integrator state.

### Parameter contract

- `engine.virtual-analog.filter-mode`: enum `off|lowpass|highpass|bandpass`, default `off`.
- `engine.virtual-analog.filter-cutoff`: 20–20,000 Hz, default 12,000 Hz.
- `engine.virtual-analog.filter-resonance`: Q 0.5–12, default approximately 0.707.

The default mode is OFF to preserve the pre-filter sound. Parameter updates are validated by the existing Virtual Analog parameter registry, transmitted through `SynzerEngine.setParameters()` and `SET_PARAMETERS`, and applied to active voices in the AudioWorklet. Newly triggered voices receive their own filter instance initialized from the current parameter snapshot.

The GLOBAL panel now exposes mode, logarithmic cutoff and resonance controls. These values are part of the existing local patch format, so saving/loading patches also stores/restores the filter settings without changing the patch schema version.

### Verification added

- Spectral response tests for low-pass, high-pass and band-pass behavior.
- Exact bypass test for OFF mode.
- Finite-output stress test at high cutoff and resonance.
- Parameter validation and integrator-state retention tests.
- VoiceEngine tests for live parameter updates and independent per-voice state.
- PatchStore tests for filter parameter persistence.
- Chromium smoke test extended to save, change and restore filter mode, cutoff and resonance through the UI.

### Current limits

This is a second-order multimode SVF, not a full filter suite. No ladder, diode, comb, formant, drive/saturation, self-oscillation or oversampling is implemented. There is no filter visualization or modulation routing yet. The resonance/Q mapping is a direct DSP parameter, not a calibrated emulation of a specific analog circuit. Device-level CPU, latency and sound quality on Android/POCO remain unverified until tested on physical hardware.


## Dedicated filter envelope (EG 02)

The Virtual Analog engine now has an independent ADSR envelope for filter cutoff modulation. It is triggered on NOTE_ON and enters its own release stage on NOTE_OFF; it does not reuse or alter the amplitude envelope.

Parameters:
- `engine.virtual-analog.filter-env-attack`: 0–30 s, default 0.01 s.
- `engine.virtual-analog.filter-env-decay`: 0–30 s, default 0.3 s.
- `engine.virtual-analog.filter-env-sustain`: 0–1, default 0.
- `engine.virtual-analog.filter-env-release`: 0–60 s, default 0.25 s.
- `engine.virtual-analog.filter-env-amount`: −48 to +48 semitones, default 0.

The modulation is bipolar and exponential in frequency: `modulatedCutoff = baseCutoff * 2 ** (amountSemitones * envelopeLevel / 12)`. Negative amounts close the cutoff; positive amounts open it. The result is constrained to 20 Hz and 45% of the active sample rate. The base cutoff remains a separate parameter. The TPT filter gained a cutoff-only coefficient update method that preserves integrator state. Modulation is applied sample-by-sample to active voices when the filter is enabled and amount is nonzero.

The new envelope parameters are part of the existing Virtual Analog parameter registry and patch schema. Existing patches receive neutral modulation defaults (amount 0), so their sound is unchanged.

The render benchmark now includes a deliberately long, continuously moving filter-envelope ramp across 12 voices, exercising coefficient updates rather than measuring only a static filter.

Limit: cutoff modulation currently recalculates TPT coefficients per sample and per active voice while the envelope is moving. The CI benchmark measures this on its Linux x64 runner; ARM64/Android profiling remains required before deciding whether a coefficient lookup table or block-rate ramp is necessary.


## LFO 01 — per-voice low-frequency oscillator

A first LFO source is now implemented and routed to the Virtual Analog filter cutoff. The oscillator is retriggered per voice at phase 0 and continues advancing even when its modulation amount is zero, so enabling depth during a held note does not reset phase.

Supported waveforms: sine, triangle, square, saw-up and saw-down. Rate range: 0.05–20 Hz. Depth: −48 to +48 semitones. The LFO is bipolar and exponential in frequency; its semitone contribution is summed with the independent filter-envelope contribution before cutoff clamping.

Parameter IDs:
- `engine.virtual-analog.lfo1-rate`
- `engine.virtual-analog.lfo1-waveform`
- `engine.virtual-analog.lfo1-amount`

Rate/waveform/depth changes update active voices while preserving oscillator phase. LFO depth defaults to zero, so existing patches remain sonically unchanged. The source is currently hard-routed to filter cutoff; the general modulation matrix, additional destinations, tempo sync, phase offset, fade-in/delay, and global/free-running LFO modes are not implemented.

The MODIFIERS panel exposes waveform, rate and bipolar depth controls and a waveform scope. Patch save/load includes the three LFO parameters. Browser smoke verifies persistence/restoration; unit tests verify waveform polarity/range, frequency, phase preservation, per-voice retrigger and live filter modulation.


## Modulation Matrix v1 — routing engine

A validated modulation-routing layer now sits between per-voice modulation sources and DSP destinations.

Supported sources: `filter-envelope` (EG 02), `pitch-envelope` (EG 03) and `lfo-1`.
Supported destinations: `filter-cutoff`, `oscillator-1-pitch` and `oscillator-2-pitch`.
Each route has a stable ID, source, destination, bipolar amount in semitones and enabled flag. The matrix validates source/destination IDs, route IDs, duplicate IDs, amount bounds and boolean enable state; invalid route updates are rejected atomically. `computeDestination()` sums only enabled routes and returns the destination modulation in semitones.

The Virtual Analog engine now computes filter cutoff modulation through this matrix rather than directly adding source values. Eight fixed routes are registered: EG 02 and LFO 01 to filter cutoff and both oscillator pitches, plus EG 03 to both oscillator pitches. Each route has a typed amount and independent enable flag. Amounts default to zero, preserving saved patch sound.

The MATRIX UI exposes each route enable toggle and depth control. EG 02 and LFO 01 source panels display the route state/depth but route editing is centralized in MATRIX. Browser smoke covers saving/restoring route depth and enabled state.

This is a deliberately bounded matrix: it supports three registered sources and three destinations. Amplitude, pan, wavetable position, user-created route graphs, tempo-synced sources and per-layer routing are not implemented yet.


### Modulation matrix hot-path optimization

The generic `computeDestination()` API remains available for validation and future routing. Each destination compiles enabled route amounts when routes change. The sample loop snapshots the coefficients once per render quantum and performs direct source-value multiplications, avoiding per-sample route iteration and source-object lookups.


## Virtual Analog Oscillator 02

A second independently configured oscillator is now available per voice. Oscillator 02 supports the same band-limited saw/square and sine waveforms as oscillator 01, with enable, waveform, level, octave, semitone and fine-cent controls. Its frequency ratio is `2 ** (octave + semitone/12 + fine/1200)`, clamped to 45% of the active sample rate. It owns an independent phase that advances while disabled and is preserved when its settings change on an active voice.

When enabled, the two oscillator signals are mixed with level-weighted normalization `(osc1 + osc2 * level) / (1 + level)` before the per-voice filter, preventing the second oscillator from doubling the maximum single-voice amplitude. Both oscillators share the voice amplitude envelope, filter envelope, LFO and filter path. Oscillator 02 defaults disabled, so existing patches retain the exact single-oscillator sound.

The WAVEFORM panel exposes OSC 02 enable, waveform, level, octave, semitone and fine controls. Parameters are part of the typed registry and local patch persistence. No oscillator sync, FM, ring modulation, hard sync, phase offset or independent oscillator envelopes are implemented yet. Unison, Sub Oscillator and the separate white/pink Noise Generator are documented below.


## Modulation Matrix v2 · oscillator pitch destinations

The Virtual Analog matrix now compiles eight fixed routes: EG 02 and LFO 01 to filter cutoff, OSC 01 pitch, and OSC 02 pitch; EG 03 to OSC 01 and OSC 02 pitch. Pitch destinations are expressed in bipolar semitones (−48…+48) and each route has an independent typed enable flag and amount parameter. Defaults are neutral (amount 0), preserving legacy patch sound.

Per render quantum, route amounts are snapshotted from the compiled matrix. Per sample, EG 02, EG 03 and LFO source values produce separate pitch offsets for each oscillator. The offsets modify phase increments exponentially (`2 ** (semitones / 12)`), with oscillator frequency capped at 45% of sample rate; PolyBLEP receives the modulated increment for discontinuous waveforms. OSC 01 and OSC 02 remain independently routable. No pitch glide/smoothing, dynamic user-created route graph, additional modulation sources, or pitch destinations for future engines are claimed.

New parameter IDs include the eight pitch routes and the EG 03 ADSR: `pitch-env-attack`, `pitch-env-decay`, `pitch-env-sustain`, `pitch-env-release`, `pitch-env-osc1-amount`, `pitch-env-osc1-enabled`, `pitch-env-osc2-amount`, `pitch-env-osc2-enabled`, all under `engine.virtual-analog.`. EG 03 is independent per voice, has its own ADSR stage, and is summed with the other pitch sources before the exponential frequency conversion. It does not reuse the amplitude or filter envelope. Its default route depths are zero, preserving previous sound. Existing PatchStore schema normalizes missing values to neutral defaults, retaining compatibility with earlier local patches.


## Independent pitch envelope · EG 03

The Virtual Analog engine now provides a third per-voice ADSR source dedicated to oscillator pitch. EG 03 has independent attack, decay, sustain and release stages; it does not reuse the amplitude envelope or EG 02. Its bipolar depth is routed independently to OSC 01 and OSC 02 through the modulation matrix, with each destination having its own amount (−48…+48 semitones) and enable flag.

Defaults: attack 5 ms, decay 80 ms, sustain 0, release 80 ms; both pitch-route amounts default to zero. EG 03 therefore remains sonically neutral until a route amount is raised. The envelope state is created on NOTE_ON, released on NOTE_OFF, updated on active voices without resetting its current stage, and included in local patch save/load. Browser smoke verifies the controls and patch round-trip; unit tests verify pitch ratios, independent release, route compilation and defensive state snapshots.

The DSP loop snapshots the two compiled EG 03 route coefficients once per render quantum and advances the envelope once per sample per voice. The informational benchmark includes EG 03 modulation at 12 voices. Desktop benchmark output is not an Android performance claim; physical-device profiling remains outstanding.


## Noise Generator · white and pink

The Virtual Analog voice now includes an optional per-voice noise source. It is mixed with OSC 01 and OSC 02 before the shared TPT filter and amplitude ADSR, so it follows the same note lifecycle and filter response. Each voice receives a deterministic non-zero uint32 seed derived from its allocation sequence; this makes test renders repeatable while keeping voices decorrelated. The PRNG is xorshift32.

- `noise-enabled`: boolean, default false.
- `noise-color`: `white` or `pink`, default `white`.
- `noise-level`: 0…1 linear, default 0.25.

White noise uses a uniform bipolar sequence. Pink mode uses a multi-pole IIR filter based on the Paul Kellet approximation; it reduces high-frequency energy relative to white noise but is not claimed to be a calibrated 1/f source. Color changes preserve the PRNG stream and pink filter state. The generator is allocated per voice, not shared globally.

When noise is disabled or its level is zero, the renderer retains the prior oscillator mix path bit-for-bit. When active, the three sources are linearly summed and normalized by `1 + osc2Level + noiseLevel`, preventing simple additive peak growth. Noise passes through the existing per-voice filter and amplitude envelope; it has no independent pitch or modulation destination yet. Parameters are typed, included in local patches, restored by the UI, and exercised in the Chromium AudioWorklet smoke test with 12 simultaneous voices.

The informational DSP benchmark now includes 12 active pink-noise generators. Desktop timing is not an ARM64/Android performance claim.


## Unison · up to four detuned lanes per note

The Virtual Analog engine now supports 1–4 simultaneous oscillator lanes per note. The same lane count and symmetric detune apply to OSC 01 and OSC 02. For N lanes, the detune positions span `−D…+D` cents evenly around the center; each lane has independent phase accumulators. Each oscillator's lanes are averaged before OSC 01/OSC 02 level mixing, preventing simple linear growth in amplitude.

- `unison-voices`: integer 1…4, default 1 (legacy single-lane behavior).
- `unison-detune`: 0…50 cents, default 12 cents (ignored at one lane).

Changing lane count while notes are active preserves the primary phase and initializes new lanes from it, avoiding a phase reset. Changing detune preserves all existing phase accumulators. The renderer retains the original single-lane code path bit-for-bit when count is 1. Unison is currently mono: no stereo spread/pan is implemented yet. It multiplies oscillator workload per active note, so device profiling on ARM64/Android remains required before increasing default polyphony.

The UI exposes lane count and detune in WAVEFORM; patch save/load and the AudioWorklet smoke scenario cover both parameters. The benchmark now runs 12 notes with three lanes on both oscillators plus pink noise and the existing filter/envelopes/modulation.


## Sub Oscillator · independent low-frequency layer

The Virtual Analog engine now provides a dedicated sub oscillator per note, independent from OSC 01/02 and the Unison phase lanes. It supports sine, saw and square waveforms, octave −1 or −2, a linear level control and an enable flag. Square and saw use the same PolyBLEP band-limiting path as the main oscillators.

The sub follows the note frequency one or two octaves below and receives the combined OSC 01 pitch modulation (EG 02, EG 03 and LFO 01). Its phase is independent and preserved when waveform, level or octave changes on active voices. It shares the existing voice filter and amplitude envelope; no separate sub envelope, modulation-matrix destination or stereo spread is implemented.

Defaults: disabled, square, level 0.25, octave −1. Disabled state preserves the prior oscillator signal bit-for-bit. When enabled, Sub is linearly mixed and normalized with OSC 01/02 and Noise. The sub phase advances without rendering a waveform while disabled to avoid unnecessary oscillator work. Parameters are typed and included in local patch save/load; unit tests cover pitch ratio, independent phase, live updates and neutral defaults, while browser smoke covers the UI and patch round-trip.
