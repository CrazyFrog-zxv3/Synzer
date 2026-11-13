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
