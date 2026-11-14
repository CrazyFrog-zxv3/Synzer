import { createPatch, validatePatch, serializePatch, deserializePatch } from './PatchSchema.js';
import { createDefaultVirtualAnalogParameters, normalizeVirtualAnalogParameters } from './VirtualAnalogParameters.js';
import { createDefaultFMParameters } from './FMVoiceEngine.js';

export const PATCH_STORAGE_KEY = 'synzer.patches.v1';

const DEFAULT_EFFECT_PARAMETERS = Object.freeze({ time: 0.375, feedback: 0.28, mix: 0, pingPong: false, roomSize: 0.72, damping: 0.35, reverbMix: 0, width: 0.8, preDelayMs: 0, earlyLevel: 0.65, modulationRateHz: 0.35, modulationDepthMs: 0 });
const DEFAULT_EFFECT_RACK = Object.freeze({ order: ['delay', 'reverb'], enabled: { delay: true, reverb: true } });
const EFFECT_RACK_IDS = Object.freeze({ order: 'global.fx-rack-order', delay: 'global.fx-rack-delay-enabled', reverb: 'global.fx-rack-reverb-enabled' });
const EFFECT_PARAMETER_IDS = Object.freeze({
  time: 'global.fx-delay-time',
  feedback: 'global.fx-delay-feedback',
  mix: 'global.fx-delay-mix',
  pingPong: 'global.fx-delay-ping-pong',
  roomSize: 'global.fx-reverb-room-size',
  damping: 'global.fx-reverb-damping',
  reverbMix: 'global.fx-reverb-mix',
  width: 'global.fx-reverb-width',
  preDelayMs: 'global.fx-reverb-predelay-ms',
  earlyLevel: 'global.fx-reverb-early-level',
  modulationRateHz: 'global.fx-reverb-modulation-rate',
  modulationDepthMs: 'global.fx-reverb-modulation-depth',
});

function normalizeEffectParameters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Effect parameters must be an object.');
  const next = { ...DEFAULT_EFFECT_PARAMETERS, ...input };
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_EFFECT_PARAMETERS, key)) throw new TypeError(`Unknown effect parameter: ${key}`);
  if (!Number.isFinite(next.time) || next.time < 0.005 || next.time > 2) throw new RangeError('Delay time must be between 0.005 and 2 seconds.');
  if (!Number.isFinite(next.feedback) || next.feedback < -0.95 || next.feedback > 0.95) throw new RangeError('Delay feedback must be between -0.95 and 0.95.');
  if (!Number.isFinite(next.mix) || next.mix < 0 || next.mix > 1) throw new RangeError('Delay mix must be between 0 and 1.');
  if (typeof next.pingPong !== 'boolean') throw new TypeError('Delay pingPong must be a boolean.');
  if (!Number.isFinite(next.roomSize) || next.roomSize < 0 || next.roomSize > 0.98) throw new RangeError('Reverb roomSize must be between 0 and 0.98.');
  if (!Number.isFinite(next.damping) || next.damping < 0 || next.damping > 1) throw new RangeError('Reverb damping must be between 0 and 1.');
  if (!Number.isFinite(next.reverbMix) || next.reverbMix < 0 || next.reverbMix > 1) throw new RangeError('Reverb mix must be between 0 and 1.');
  if (!Number.isFinite(next.width) || next.width < 0 || next.width > 1) throw new RangeError('Reverb width must be between 0 and 1.');
  if (!Number.isFinite(next.preDelayMs) || next.preDelayMs < 0 || next.preDelayMs > 200) throw new RangeError('Reverb preDelayMs must be between 0 and 200.');
  if (!Number.isFinite(next.earlyLevel) || next.earlyLevel < 0 || next.earlyLevel > 1) throw new RangeError('Reverb earlyLevel must be between 0 and 1.');
  if (!Number.isFinite(next.modulationRateHz) || next.modulationRateHz < 0.05 || next.modulationRateHz > 2) throw new RangeError('Reverb modulationRateHz must be between 0.05 and 2.');
  if (!Number.isFinite(next.modulationDepthMs) || next.modulationDepthMs < 0 || next.modulationDepthMs > 2) throw new RangeError('Reverb modulationDepthMs must be between 0 and 2.');
  return next;
}

function normalizeEffectRackConfiguration(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Effect rack configuration must be an object.');
  const order = input.order ?? DEFAULT_EFFECT_RACK.order;
  const enabled = input.enabled ?? {};
  if (!Array.isArray(order) || order.length !== 2 || new Set(order).size !== 2 || !['delay', 'reverb'].every((name) => order.includes(name))) throw new RangeError('Effect rack order must contain delay and reverb exactly once.');
  if (!enabled || typeof enabled !== 'object' || Array.isArray(enabled)) throw new TypeError('Effect rack enabled settings must be an object.');
  for (const [name, value] of Object.entries(enabled)) {
    if (!['delay', 'reverb'].includes(name)) throw new TypeError(`Unknown effect rack module: ${name}`);
    if (typeof value !== 'boolean') throw new TypeError(`Effect rack enabled.${name} must be a boolean.`);
  }
  return { order: [...order], enabled: { ...DEFAULT_EFFECT_RACK.enabled, ...enabled } };
}

function addEffectRackConfiguration(globalParameters, input) {
  const rack = normalizeEffectRackConfiguration(input);
  globalParameters[EFFECT_RACK_IDS.order] = rack.order.join(',');
  globalParameters[EFFECT_RACK_IDS.delay] = rack.enabled.delay;
  globalParameters[EFFECT_RACK_IDS.reverb] = rack.enabled.reverb;
  return globalParameters;
}

function withoutEffectParameters(globalParameters) {
  const result = { ...globalParameters };
  for (const id of Object.values(EFFECT_PARAMETER_IDS)) delete result[id];
  for (const id of Object.values(EFFECT_RACK_IDS)) delete result[id];
  return result;
}

function addEffectParameters(globalParameters, effects) {
  const normalized = normalizeEffectParameters(effects);
  for (const [key, id] of Object.entries(EFFECT_PARAMETER_IDS)) globalParameters[id] = normalized[key];
  return globalParameters;
}

function assertStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('A Storage-compatible object is required.');
  }
}

function readStoredPatches(storage) {
  assertStorage(storage);
  const raw = storage.getItem(PATCH_STORAGE_KEY);
  if (raw === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyntaxError('Stored patch collection contains invalid JSON.');
  }
  if (!Array.isArray(parsed)) throw new TypeError('Stored patch collection must be an array.');
  return parsed.map((patch) => validatePatch(patch));
}

export function createVirtualAnalogPatch(parameters = {}, name = 'Init', effectParameters = {}, effectRackConfiguration = {}) {
  const normalized = normalizeVirtualAnalogParameters({
    ...createDefaultVirtualAnalogParameters(),
    ...parameters,
  });
  const globalParameters = {};
  const engineParameters = {};
  for (const [id, value] of Object.entries(normalized)) {
    if (id.startsWith('global.')) globalParameters[id] = value;
    else engineParameters[id] = value;
  }
  addEffectParameters(globalParameters, effectParameters);
  addEffectRackConfiguration(globalParameters, effectRackConfiguration);
  return createPatch({
    name,
    globalParameters,
    engineSlots: [{
      slotId: 'layer-a',
      engineId: 'virtual-analog',
      enabled: true,
      parameters: engineParameters,
    }],
  });
}

export function applyVirtualAnalogPatch(input) {
  const patch = validatePatch(input);
  if (patch.engineSlots.length !== 1 ||
      patch.engineSlots[0].engineId !== 'virtual-analog' ||
      patch.engineSlots[0].enabled !== true) {
    throw new Error('This runtime currently supports patches with one enabled Virtual Analog engine slot only.');
  }
  return normalizeVirtualAnalogParameters({
    ...withoutEffectParameters(patch.globalParameters),
    ...patch.engineSlots[0].parameters,
  });
}


export function createFMEnginePatch(parameters = {}, name = 'FM Init', effectParameters = {}, effectRackConfiguration = {}) {
  const normalized = { ...createDefaultFMParameters(), ...parameters };
  const globalParameters = {};
  const engineParameters = {};
  for (const [id, value] of Object.entries(normalized)) {
    if (id.startsWith('global.')) globalParameters[id] = value;
    else if (id.startsWith('engine.fm.')) engineParameters[id] = value;
  }
  addEffectParameters(globalParameters, effectParameters);
  addEffectRackConfiguration(globalParameters, effectRackConfiguration);
  return createPatch({ name, globalParameters, engineSlots: [{ slotId: 'layer-fm', engineId: 'fm', enabled: true, parameters: engineParameters }] });
}

export function applyFMEnginePatch(input) {
  const patch = validatePatch(input);
  if (patch.engineSlots.length !== 1 || patch.engineSlots[0].engineId !== 'fm' || patch.engineSlots[0].enabled !== true) {
    throw new Error('This runtime currently supports patches with one enabled FM engine slot only.');
  }
  return { ...createDefaultFMParameters(), ...withoutEffectParameters(patch.globalParameters), ...patch.engineSlots[0].parameters };
}


export function applyPatchEffectRackConfiguration(input) {
  const patch = validatePatch(input);
  const global = patch.globalParameters;
  const orderValue = global[EFFECT_RACK_IDS.order];
  const order = typeof orderValue === 'string' ? orderValue.split(',') : DEFAULT_EFFECT_RACK.order;
  return normalizeEffectRackConfiguration({ order, enabled: {
    delay: global[EFFECT_RACK_IDS.delay] ?? true,
    reverb: global[EFFECT_RACK_IDS.reverb] ?? true,
  } });
}

export function applyPatchEffectParameters(input) {
  const patch = validatePatch(input);
  const stored = {};
  for (const [key, id] of Object.entries(EFFECT_PARAMETER_IDS)) {
    if (Object.hasOwn(patch.globalParameters, id)) stored[key] = patch.globalParameters[id];
  }
  return normalizeEffectParameters(stored);
}

export function savePatch(storage, input) {
  const patch = validatePatch(input);
  const patches = readStoredPatches(storage);
  if (patches.some((existing) => existing.name.toLowerCase() === patch.name.toLowerCase())) {
    throw new Error(`Patch already exists: ${patch.name}`);
  }
  patches.push(patch);
  storage.setItem(PATCH_STORAGE_KEY, JSON.stringify(patches.map((item) => JSON.parse(serializePatch(item)))));
  return patch;
}

export function listPatches(storage) {
  return readStoredPatches(storage).map((patch) => patch.name);
}

export function loadPatch(storage, name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('Patch name must be a non-empty string.');
  }
  const patch = readStoredPatches(storage).find((item) => item.name === name);
  if (!patch) throw new Error(`Patch not found: ${name}`);
  return deserializePatch(serializePatch(patch));
}
