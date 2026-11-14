const MODULES = Object.freeze(['delay', 'reverb']);

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
    this.order = [...MODULES];
    this.enabled = { delay: true, reverb: true };
  }

  getConfiguration() {
    return { order: [...this.order], enabled: { ...this.enabled } };
  }

  setConfiguration(configuration = {}) {
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
      throw new TypeError('Effect rack configuration must be an object.');
    }
    for (const key of Object.keys(configuration)) {
      if (key !== 'order' && key !== 'enabled') throw new TypeError(`Unknown effect rack setting: ${key}`);
    }
    let nextOrder = this.order;
    let nextEnabled = this.enabled;
    if (configuration.order !== undefined) {
      const order = configuration.order;
      if (!Array.isArray(order) || order.length !== MODULES.length || new Set(order).size !== MODULES.length || MODULES.some((name) => !order.includes(name))) {
        throw new RangeError(`Effect rack order must contain each module exactly once: ${MODULES.join(', ')}.`);
      }
      nextOrder = [...order];
    }
    if (configuration.enabled !== undefined) {
      const enabled = configuration.enabled;
      if (!enabled || typeof enabled !== 'object' || Array.isArray(enabled)) throw new TypeError('Effect rack enabled settings must be an object.');
      for (const [name, value] of Object.entries(enabled)) {
        if (!MODULES.includes(name)) throw new TypeError(`Unknown enabled effect module: ${name}`);
        if (typeof value !== 'boolean') throw new TypeError(`Effect rack enabled.${name} must be a boolean.`);
      }
      nextEnabled = { ...this.enabled, ...enabled };
    }
    this.order = nextOrder;
    this.enabled = nextEnabled;
    return this.getConfiguration();
  }

  process(left, right = left) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) {
      throw new TypeError('EffectRack expects matching Float32Array channel buffers.');
    }
    for (const name of this.order) {
      this.modules[name].process(left, right, { bypass: !this.enabled[name] });
    }
    return { left, right };
  }
}
