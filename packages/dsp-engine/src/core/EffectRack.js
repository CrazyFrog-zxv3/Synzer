const MODULES = Object.freeze(['delay', 'reverb']);
const DEFAULT_LEVEL = Object.freeze({ send: 1, return: 1 });

function validateGain(name, value, maximum = 2) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be finite and between 0 and ${maximum}.`);
  }
}

function normalizeLevels(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Effect rack levels must be an object.');
  const next = { ...current };
  for (const [name, values] of Object.entries(input)) {
    if (!MODULES.includes(name)) throw new TypeError(`Unknown effect level module: ${name}`);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError(`Effect rack levels.${name} must be an object.`);
    for (const key of Object.keys(values)) if (key !== 'send' && key !== 'return') throw new TypeError(`Unknown effect level: ${name}.${key}`);
    const level = { ...next[name], ...values };
    validateGain(`${name}.send`, level.send);
    validateGain(`${name}.return`, level.return);
    next[name] = level;
  }
  return next;
}


const DEFAULT_CONFIGURATION = Object.freeze({
  mode: 'serial', order: ['delay', 'reverb'], enabled: { delay: true, reverb: true },
  levels: { delay: { send: 1, return: 1 }, reverb: { send: 1, return: 1 } }, dryLevel: 1, wetLevel: 1,
});

export function normalizeEffectRackConfiguration(configuration = {}, current = DEFAULT_CONFIGURATION) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new TypeError('Effect rack configuration must be an object.');
  const allowed = ['mode', 'order', 'enabled', 'levels', 'dryLevel', 'wetLevel'];
  for (const key of Object.keys(configuration)) if (!allowed.includes(key)) throw new TypeError(`Unknown effect rack setting: ${key}`);
  const mode = configuration.mode ?? current.mode;
  if (!['serial', 'parallel'].includes(mode)) throw new RangeError('Effect rack mode must be serial or parallel.');
  const order = configuration.order ?? current.order;
  if (!Array.isArray(order) || order.length !== MODULES.length || new Set(order).size !== MODULES.length || MODULES.some((name) => !order.includes(name))) throw new RangeError(`Effect rack order must contain each module exactly once: ${MODULES.join(', ')}.`);
  const enabledInput = configuration.enabled ?? {};
  if (!enabledInput || typeof enabledInput !== 'object' || Array.isArray(enabledInput)) throw new TypeError('Effect rack enabled settings must be an object.');
  for (const [name, value] of Object.entries(enabledInput)) {
    if (!MODULES.includes(name)) throw new TypeError(`Unknown enabled effect module: ${name}`);
    if (typeof value !== 'boolean') throw new TypeError(`Effect rack enabled.${name} must be a boolean.`);
  }
  const enabled = { ...current.enabled, ...enabledInput };
  const levels = configuration.levels === undefined ? current.levels : normalizeLevels(configuration.levels, current.levels);
  const dryLevel = configuration.dryLevel ?? current.dryLevel;
  const wetLevel = configuration.wetLevel ?? current.wetLevel;
  validateGain('dryLevel', dryLevel, 2);
  validateGain('wetLevel', wetLevel, 2);
  return { mode, order: [...order], enabled, levels: { delay: { ...levels.delay }, reverb: { ...levels.reverb } }, dryLevel, wetLevel };
}

export class EffectRack {
  constructor(modules = {}) {
    for (const name of MODULES) {
      if (!modules[name] || typeof modules[name].process !== 'function') {
        throw new TypeError(`EffectRack requires a processable ${name} module.`);
      }
    }
    for (const name of Object.keys(modules)) {
      if (!MODULES.includes(name)) throw new TypeError(`Unknown effect module: ${name}`);
    }
    this.modules = modules;
    this.mode = 'serial';
    this.order = [...MODULES];
    this.enabled = { delay: true, reverb: true };
    this.levels = { delay: { ...DEFAULT_LEVEL }, reverb: { ...DEFAULT_LEVEL } };
    this.dryLevel = 1;
    this.wetLevel = 1;
    this.sampleRate = modules.delay.sampleRate ?? modules.reverb.sampleRate ?? 48000;
    this.gainSmoothing = 1 - Math.exp(-1 / (0.01 * this.sampleRate));
    this.currentLevels = { delay: { send: 1, return: 1 }, reverb: { send: 1, return: 1 }, dryLevel: 1, wetLevel: 1 };
    this.scratch = null;
  }

  getConfiguration() {
    return {
      mode: this.mode,
      order: [...this.order],
      enabled: { ...this.enabled },
      levels: { delay: { ...this.levels.delay }, reverb: { ...this.levels.reverb } },
      dryLevel: this.dryLevel,
      wetLevel: this.wetLevel,
    };
  }

  setConfiguration(configuration = {}) {
    const next = normalizeEffectRackConfiguration(configuration, this.getConfiguration());
    this.mode = next.mode;
    this.order = next.order;
    this.enabled = next.enabled;
    this.levels = next.levels;
    this.dryLevel = next.dryLevel;
    this.wetLevel = next.wetLevel;
    return this.getConfiguration();
  }

  #ensureScratch(length) {
    if (!this.scratch || this.scratch.sumLeft.length !== length) {
      this.scratch = { sumLeft: new Float32Array(length), sumRight: new Float32Array(length), branchLeft: new Float32Array(length), branchRight: new Float32Array(length), dryGain: new Float32Array(length), delayReturnGain: new Float32Array(length), reverbReturnGain: new Float32Array(length), reverbSendGain: new Float32Array(length) };
    }
    return this.scratch;
  }

  #processSerial(left, right) {
    for (const name of this.order) {
      this.modules[name].process(left, right, { bypass: !this.enabled[name] });
    }
    return { left, right };
  }

  #processParallel(left, right) {
    const scratch = this.#ensureScratch(left.length);
    const originalLeft = left;
    const originalRight = right;
    const mono = right === left;
    const smoothing = this.gainSmoothing;
    const current = this.currentLevels;

    for (let i = 0; i < left.length; i += 1) {
      current.delay.send += (this.levels.delay.send - current.delay.send) * smoothing;
      current.delay.return += (this.levels.delay.return - current.delay.return) * smoothing;
      current.reverb.send += (this.levels.reverb.send - current.reverb.send) * smoothing;
      current.reverb.return += (this.levels.reverb.return - current.reverb.return) * smoothing;
      current.dryLevel += (this.dryLevel - current.dryLevel) * smoothing;
      current.wetLevel += (this.wetLevel - current.wetLevel) * smoothing;

      const returnBudget = (this.enabled.delay ? current.delay.send * current.delay.return : 0)
        + (this.enabled.reverb ? current.reverb.send * current.reverb.return : 0);
      const normalization = 1 / Math.max(1, current.dryLevel + (current.wetLevel * returnBudget));
      scratch.dryGain[i] = current.dryLevel * normalization;
      scratch.delayReturnGain[i] = this.enabled.delay ? current.delay.return * current.wetLevel * normalization : 0;
      scratch.reverbReturnGain[i] = this.enabled.reverb ? current.reverb.return * current.wetLevel * normalization : 0;
      scratch.branchLeft[i] = originalLeft[i] * current.delay.send;
      scratch.reverbSendGain[i] = current.reverb.send;
      if (!mono) scratch.branchRight[i] = originalRight[i] * current.delay.send;
    }

    this.modules.delay.process(scratch.branchLeft, mono ? scratch.branchLeft : scratch.branchRight, { bypass: !this.enabled.delay, wetOnly: true });

    for (let i = 0; i < left.length; i += 1) {
      scratch.sumLeft[i] = (originalLeft[i] * scratch.dryGain[i]) + (scratch.branchLeft[i] * scratch.delayReturnGain[i]);
      if (!mono) scratch.sumRight[i] = (originalRight[i] * scratch.dryGain[i]) + (scratch.branchRight[i] * scratch.delayReturnGain[i]);
      scratch.branchLeft[i] = originalLeft[i] * scratch.reverbSendGain[i];
      if (!mono) scratch.branchRight[i] = originalRight[i] * scratch.reverbSendGain[i];
    }

    this.modules.reverb.process(scratch.branchLeft, mono ? scratch.branchLeft : scratch.branchRight, { bypass: !this.enabled.reverb, wetOnly: true });
    for (let i = 0; i < left.length; i += 1) {
      scratch.sumLeft[i] += scratch.branchLeft[i] * scratch.reverbReturnGain[i];
      if (!mono) scratch.sumRight[i] += scratch.branchRight[i] * scratch.reverbReturnGain[i];
    }

    left.set(scratch.sumLeft);
    if (!mono) right.set(scratch.sumRight);
    return { left, right };
  }

  process(left, right = left) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) {
      throw new TypeError('EffectRack expects matching Float32Array channel buffers.');
    }
    return this.mode === 'parallel' ? this.#processParallel(left, right) : this.#processSerial(left, right);
  }
}
