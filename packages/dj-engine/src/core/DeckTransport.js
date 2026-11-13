const MIN_RATE = 0.25;
const MAX_RATE = 4;
const MIN_GAIN = 0;
const MAX_GAIN = 2;

function finiteRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

function stopSource(source) {
  if (!source) return;
  source.onended = null;
  try { source.stop(); } catch {}
  try { source.disconnect(); } catch {}
}

/**
 * One-deck PCM transport. Owns its GainNode and transient BufferSourceNodes,
 * but never closes the shared AudioContext. No beatgrid, sync, scratch or DSP
 * claims are made by this transport layer.
 */
export class DeckTransport {
  constructor({ audioContext, destination = audioContext?.destination, onStateChange = null } = {}) {
    if (!audioContext || typeof audioContext.createGain !== 'function' ||
        typeof audioContext.createBufferSource !== 'function' ||
        typeof audioContext.decodeAudioData !== 'function') {
      throw new TypeError('A compatible AudioContext is required.');
    }
    if (!destination) throw new TypeError('An audio destination is required.');
    if (onStateChange !== null && typeof onStateChange !== 'function') {
      throw new TypeError('onStateChange must be a function when provided.');
    }

    this.context = audioContext;
    this.gainNode = audioContext.createGain();
    this.gainNode.connect(destination);
    this.onStateChange = onStateChange;
    this.buffer = null;
    this.source = null;
    this.status = 'empty';
    this.offset = 0;
    this.startedAt = 0;
    this.rate = 1;
    this.gain = 1;
    this.loadGeneration = 0;
    this.disposed = false;
  }

  get duration() { return this.buffer?.duration ?? 0; }
  get isLoaded() { return Boolean(this.buffer); }
  get isPlaying() { return this.status === 'playing'; }

  get position() {
    if (!this.isPlaying) return this.offset;
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    return Math.min(this.duration, this.offset + elapsed * this.rate);
  }

  snapshot() {
    return Object.freeze({
      status: this.status,
      loaded: this.isLoaded,
      duration: this.duration,
      position: this.position,
      rate: this.rate,
      gain: this.gain,
    });
  }

  #emit() {
    this.onStateChange?.(this.snapshot());
  }

  #assertUsable() {
    if (this.disposed) throw new Error('DeckTransport has been disposed.');
  }

  async loadFile(file) {
    this.#assertUsable();
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new TypeError('A File-like object with arrayBuffer() is required.');
    }
    const data = await file.arrayBuffer();
    return this.loadArrayBuffer(data);
  }

  async loadArrayBuffer(data) {
    this.#assertUsable();
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
      throw new TypeError('A non-empty ArrayBuffer is required.');
    }

    const generation = ++this.loadGeneration;
    const decoded = await this.context.decodeAudioData(data.slice(0));
    this.#assertUsable();
    if (generation !== this.loadGeneration) return false;
    if (!decoded || !Number.isFinite(decoded.duration) || decoded.duration <= 0) {
      throw new TypeError('Decoded audio buffer has an invalid duration.');
    }

    stopSource(this.source);
    this.source = null;
    this.buffer = decoded;
    this.offset = 0;
    this.startedAt = 0;
    this.status = 'loaded';
    this.#emit();
    return true;
  }

  async play() {
    this.#assertUsable();
    if (!this.buffer || this.isPlaying) return false;
    if (this.context.state === 'suspended') await this.context.resume();
    this.#assertUsable();

    if (this.offset >= this.duration) this.offset = 0;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.gainNode);
    source.onended = () => {
      if (this.source !== source || this.disposed) return;
      this.source = null;
      this.offset = this.duration;
      this.status = 'ended';
      try { source.disconnect(); } catch {}
      this.#emit();
    };

    this.source = source;
    this.startedAt = this.context.currentTime;
    this.status = 'playing';
    try {
      source.start(0, this.offset);
    } catch (error) {
      this.source = null;
      this.status = 'loaded';
      try { source.disconnect(); } catch {}
      throw error;
    }
    this.#emit();
    return true;
  }

  pause() {
    this.#assertUsable();
    if (!this.isPlaying || !this.source) return false;
    this.offset = this.position;
    const source = this.source;
    this.source = null;
    stopSource(source);
    this.status = 'paused';
    this.#emit();
    return true;
  }

  async seek(seconds) {
    this.#assertUsable();
    if (!this.buffer) return false;
    finiteRange('position', seconds, 0, this.duration);
    const resume = this.isPlaying;
    if (resume) {
      const source = this.source;
      this.source = null;
      stopSource(source);
    }
    this.offset = seconds;
    this.status = resume ? 'paused' : (seconds === 0 ? 'loaded' : 'paused');
    this.#emit();
    if (resume) return this.play();
    return true;
  }

  setRate(rate) {
    this.#assertUsable();
    finiteRange('rate', rate, MIN_RATE, MAX_RATE);
    if (this.isPlaying) {
      this.offset = this.position;
      this.startedAt = this.context.currentTime;
    }
    this.rate = rate;
    if (this.source) this.source.playbackRate.value = rate;
    this.#emit();
    return rate;
  }

  setGain(gain) {
    this.#assertUsable();
    finiteRange('gain', gain, MIN_GAIN, MAX_GAIN);
    this.gain = gain;
    this.gainNode.gain.value = gain;
    this.#emit();
    return gain;
  }

  stop() {
    this.#assertUsable();
    stopSource(this.source);
    this.source = null;
    this.offset = 0;
    this.startedAt = 0;
    this.status = this.buffer ? 'loaded' : 'empty';
    this.#emit();
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.loadGeneration++;
    stopSource(this.source);
    this.source = null;
    this.buffer = null;
    this.offset = 0;
    this.status = 'disposed';
    this.disposed = true;
    try { this.gainNode.disconnect(); } catch {}
    this.#emit();
  }
}
