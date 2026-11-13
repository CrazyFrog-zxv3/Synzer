const PATCH_SCHEMA_VERSION = 1;
const PARAMETER_ID_PATTERN = /^(?:global|engine\.[a-z][a-z0-9-]*)\.[a-z][a-z0-9-]*$/;
const ENGINE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SLOT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function defineParameter({
  id,
  type,
  defaultValue,
  min,
  max,
  step,
  unit = null,
  choices,
} = {}) {
  if (typeof id !== 'string' || !PARAMETER_ID_PATTERN.test(id)) {
    throw new TypeError('Parameter id must be stable and namespaced (global.* or engine.<id>.*).');
  }

  if (!['number', 'boolean', 'enum'].includes(type)) {
    throw new TypeError('Parameter type must be number, boolean, or enum.');
  }

  if (type === 'number') {
    if (!Number.isFinite(defaultValue)) throw new TypeError('Numeric parameter default must be finite.');
    if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
      throw new TypeError('Numeric parameter bounds must be finite.');
    }
    if (min !== undefined && max !== undefined && min > max) {
      throw new RangeError('Numeric parameter range is invalid.');
    }
    if (min !== undefined && defaultValue < min || max !== undefined && defaultValue > max) {
      throw new RangeError('Numeric parameter default is outside its range.');
    }
    if (step !== undefined && (!Number.isFinite(step) || step <= 0)) {
      throw new RangeError('Numeric parameter step must be positive and finite.');
    }
  } else if (type === 'boolean') {
    if (typeof defaultValue !== 'boolean') throw new TypeError('Boolean parameter default must be boolean.');
    if (min !== undefined || max !== undefined || step !== undefined || choices !== undefined) {
      throw new TypeError('Boolean parameters do not accept numeric bounds or choices.');
    }
  } else {
    if (!Array.isArray(choices) || choices.length === 0 ||
        choices.some((choice) => typeof choice !== 'string' || choice.length === 0) ||
        new Set(choices).size !== choices.length) {
      throw new TypeError('Enum parameter choices must be a non-empty unique string array.');
    }
    if (!choices.includes(defaultValue)) throw new TypeError('Enum default must be one of its choices.');
    if (min !== undefined || max !== undefined || step !== undefined) {
      throw new TypeError('Enum parameters do not accept numeric bounds.');
    }
  }

  if (unit !== null && typeof unit !== 'string') throw new TypeError('Parameter unit must be a string or null.');

  return deepFreeze({
    id,
    scope: id.startsWith('global.') ? 'global' : 'engine',
    type,
    defaultValue,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(step === undefined ? {} : { step }),
    unit,
    ...(choices === undefined ? {} : { choices: [...choices] }),
  });
}

function validateParameterValue(definition, value) {
  if (definition.type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Parameter ${definition.id} must be finite.`);
    if (definition.min !== undefined && value < definition.min ||
        definition.max !== undefined && value > definition.max) {
      throw new RangeError(`Parameter ${definition.id} is outside its range.`);
    }
    return value;
  }
  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError(`Parameter ${definition.id} must be boolean.`);
    return value;
  }
  if (!definition.choices.includes(value)) {
    throw new RangeError(`Parameter ${definition.id} must match an allowed choice.`);
  }
  return value;
}

export function normalizeParameterValues(definitions, values = {}) {
  if (!Array.isArray(definitions)) throw new TypeError('Parameter definitions must be an array.');
  assertRecord(values, 'Parameter values');
  const byId = new Map();
  for (const input of definitions) {
    if (!input || typeof input.id !== 'string' || byId.has(input.id)) {
      throw new TypeError('Parameter definitions must have unique ids.');
    }
    const definition = defineParameter(input);
    byId.set(definition.id, definition);
  }
  for (const id of Object.keys(values)) {
    if (!byId.has(id)) throw new Error(`Unknown parameter id: ${id}`);
  }
  const normalized = {};
  for (const [id, definition] of byId) {
    const value = Object.hasOwn(values, id) ? values[id] : definition.defaultValue;
    normalized[id] = validateParameterValue(definition, value);
  }
  return deepFreeze(normalized);
}

function normalizeParameterBag(value, expectedPrefix, label) {
  assertRecord(value, label);
  const result = {};
  for (const [id, parameterValue] of Object.entries(value)) {
    if (!PARAMETER_ID_PATTERN.test(id) || !id.startsWith(expectedPrefix)) {
      throw new TypeError(`${label} contains a parameter with an invalid scope: ${id}`);
    }
    if (typeof parameterValue === 'number' && !Number.isFinite(parameterValue)) {
      throw new TypeError(`${label} values must be finite numbers when numeric.`);
    }
    if (!['number', 'string', 'boolean'].includes(typeof parameterValue)) {
      throw new TypeError(`${label} contains an unsupported parameter value.`);
    }
    result[id] = parameterValue;
  }
  return result;
}

export function validatePatch(input) {
  assertRecord(input, 'Patch');
  if (input.schemaVersion !== PATCH_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported patch schema version: ${input.schemaVersion}`);
  }
  const name = input.name ?? 'Init';
  if (typeof name !== 'string' || name.trim().length === 0) throw new TypeError('Patch name must be a non-empty string.');
  const globalParameters = normalizeParameterBag(input.globalParameters ?? {}, 'global.', 'Global parameters');
  const slots = input.engineSlots ?? [];
  if (!Array.isArray(slots)) throw new TypeError('Engine slots must be an array.');
  const seen = new Set();
  const engineSlots = slots.map((slot) => {
    assertRecord(slot, 'Engine slot');
    if (typeof slot.slotId !== 'string' || !SLOT_ID_PATTERN.test(slot.slotId)) {
      throw new TypeError('Engine slot id must be lowercase kebab-case.');
    }
    if (seen.has(slot.slotId)) throw new Error(`Duplicate engine slot id: ${slot.slotId}`);
    seen.add(slot.slotId);
    if (typeof slot.engineId !== 'string' || !ENGINE_ID_PATTERN.test(slot.engineId)) {
      throw new TypeError('Invalid engine id; expected lowercase kebab-case.');
    }
    if (typeof slot.enabled !== 'boolean') throw new TypeError('Engine slot enabled must be boolean.');
    const parameters = normalizeParameterBag(slot.parameters ?? {}, `engine.${slot.engineId}.`, 'Engine parameters');
    return { slotId: slot.slotId, engineId: slot.engineId, enabled: slot.enabled, parameters };
  });
  return deepFreeze({
    schemaVersion: PATCH_SCHEMA_VERSION,
    name: name.trim(),
    globalParameters,
    engineSlots,
  });
}

export function createPatch({
  name = 'Init',
  globalParameters = {},
  engineSlots = [],
} = {}) {
  return validatePatch({ schemaVersion: PATCH_SCHEMA_VERSION, name, globalParameters, engineSlots });
}

export function serializePatch(patch) {
  return JSON.stringify(validatePatch(patch));
}

export function deserializePatch(serialized) {
  if (typeof serialized !== 'string') throw new TypeError('Serialized patch must be a JSON string.');
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new SyntaxError('Patch JSON is invalid.');
  }
  return validatePatch(parsed);
}
