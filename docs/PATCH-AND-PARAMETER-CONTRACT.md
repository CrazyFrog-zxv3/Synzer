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
