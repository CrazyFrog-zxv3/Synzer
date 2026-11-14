import { createPatch, validatePatch, serializePatch, deserializePatch } from './PatchSchema.js';
import { createDefaultVirtualAnalogParameters, normalizeVirtualAnalogParameters } from './VirtualAnalogParameters.js';

export const PATCH_STORAGE_KEY = 'synzer.patches.v1';

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

export function createVirtualAnalogPatch(parameters = {}, name = 'Init') {
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
    ...patch.globalParameters,
    ...patch.engineSlots[0].parameters,
  });
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
