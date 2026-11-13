const MODULATION_SOURCES = new Set(['filter-envelope', 'lfo-1']);
const MODULATION_DESTINATIONS = new Set(['filter-cutoff']);

function normalizeRoute(route) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    throw new TypeError('A modulation route must be an object.');
  }
  const { id, source, destination, amount, enabled } = route;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) {
    throw new TypeError('Modulation route id must be a stable lowercase identifier.');
  }
  if (!MODULATION_SOURCES.has(source)) throw new TypeError(`Unsupported modulation source: ${source}`);
  if (!MODULATION_DESTINATIONS.has(destination)) throw new TypeError(`Unsupported modulation destination: ${destination}`);
  if (!Number.isFinite(amount) || amount < -48 || amount > 48) {
    throw new RangeError('Modulation route amount must be between -48 and 48 semitones.');
  }
  if (typeof enabled !== 'boolean') throw new TypeError('Modulation route enabled must be boolean.');
  return Object.freeze({ id, source, destination, amount, enabled });
}

/** Small validated source-to-destination routing table for per-voice modulation signals. */
export class ModulationMatrix {
  constructor(routes = []) {
    this.routes = [];
    this.setRoutes(routes);
  }

  getRoutes() {
    return this.routes.map((route) => ({ ...route }));
  }

  setRoutes(routes) {
    if (!Array.isArray(routes) || routes.length > 16) {
      throw new TypeError('Modulation routes must be an array containing at most 16 routes.');
    }
    const normalized = routes.map(normalizeRoute);
    const ids = new Set();
    for (const route of normalized) {
      if (ids.has(route.id)) throw new Error(`Duplicate modulation route id: ${route.id}`);
      ids.add(route.id);
    }
    this.routes = normalized;
    return this.getRoutes();
  }

  setRoute(id, changes = {}) {
    if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new TypeError('Modulation route changes must be an object.');
    }
    const index = this.routes.findIndex((route) => route.id === id);
    if (index < 0) throw new Error(`Modulation route not found: ${id}`);
    const next = this.routes.map((route, routeIndex) =>
      routeIndex === index ? normalizeRoute({ ...route, ...changes }) : route);
    return this.setRoutes(next);
  }

  computeDestination(destination, sourceValues = {}) {
    if (typeof sourceValues !== 'object' || sourceValues === null || Array.isArray(sourceValues)) {
      throw new TypeError('Modulation source values must be an object.');
    }
    let total = 0;
    for (const route of this.routes) {
      if (!route.enabled || route.destination !== destination || route.amount === 0) continue;
      const value = sourceValues[route.source] ?? 0;
      if (!Number.isFinite(value) || value < -1 || value > 1) throw new RangeError(`Modulation source ${route.source} must be between -1 and 1.`);
      total += value * route.amount;
    }
    return total;
  }
}
