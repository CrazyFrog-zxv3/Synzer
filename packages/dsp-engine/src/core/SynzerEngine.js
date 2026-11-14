import { createDefaultVirtualAnalogParameters, normalizeVirtualAnalogParameters } from './VirtualAnalogParameters.js';
import { normalizeEffectRackConfiguration } from './EffectRack.js';

export class SynzerEngine {
  constructor({ audioContextFactory = () => new AudioContext(), workletUrl = new URL('../worklets/synzer-processor.js', import.meta.url), maxVoices = 12, engineId = 'virtual-analog', onError = null } = {}) {
    this.audioContextFactory = audioContextFactory;
    this.workletUrl = workletUrl;
    this.maxVoices = maxVoices;
    this.engineId = engineId;
    this.effectRackConfiguration = normalizeEffectRackConfiguration({});
    this.effectParameters = { time: 0.375, feedback: 0.28, mix: 0, pingPong: false, roomSize: 0.72, damping: 0.35, reverbMix: 0, width: 0.8, preDelayMs: 0, earlyLevel: 0.65, modulationRateHz: 0.35, modulationDepthMs: 0 };
    this.fmParameters = { 'global.master-level': 0.8, 'engine.fm.algorithm': 1, 'engine.fm.feedback': 0, ...Object.fromEntries([1, 2, 3, 4].flatMap((op) => [[`engine.fm.op${op}-ratio`, 1], [`engine.fm.op${op}-level`, op === 1 ? 0.8 : 0.7], [`engine.fm.op${op}-index`, op === 1 ? 0 : 2.5], [`engine.fm.op${op}-attack`, 0.005], [`engine.fm.op${op}-decay`, 0.15], [`engine.fm.op${op}-sustain`, 0.8], [`engine.fm.op${op}-release`, 0.22]])) };
    if (onError !== null && typeof onError !== 'function') throw new TypeError('onError must be a function when provided.');
    this.onError = onError;
    this.context = null;
    this.node = null;
    this.initPromise = null;
    this.resumePromise = null;
    this.voiceSequence = 0;
    this.handles = new Map();
    this.wavetableHandles = new Set();
    this.noteStacks = new Map();
    this.lifecycleGeneration = 0;
    this.processorFailure = null;
    this.parameters = createDefaultVirtualAnalogParameters();
  }

  async initialize() {
    if (this.processorFailure) throw this.processorFailure;
    if (this.node) {
      const context = this.context;
      const node = this.node;
      const generation = this.lifecycleGeneration;
      if (!context || context.state === 'closed') {
        throw new Error('AudioContext is closed while the audio node is still attached.');
      }
      if (context.state === 'suspended') {
        if (!this.resumePromise) {
          const resuming = (async () => {
            await context.resume();
            if (generation !== this.lifecycleGeneration || this.context !== context || this.node !== node || context.state === 'closed') {
              throw new Error('Audio engine was closed during resume.');
            }
          })();
          this.resumePromise = resuming;
        }
        const resuming = this.resumePromise;
        try { await resuming; }
        finally {
          if (this.resumePromise === resuming) this.resumePromise = null;
        }
      }
      return;
    }
    if (this.initPromise) return this.initPromise;
    const generation = this.lifecycleGeneration;
    const context = this.context ?? this.audioContextFactory();
    this.context = context;
    const assertCurrent = () => {
      if (generation !== this.lifecycleGeneration || this.context !== context || context.state === 'closed') {
        throw new Error('Audio engine was closed during initialization.');
      }
    };
    const initialization = (async () => {
      if (context.state === 'closed') throw new Error('AudioContext is closed and cannot be initialized.');
      if (context.state === 'suspended') {
        await context.resume();
        assertCurrent();
      }
      if (!context.audioWorklet?.addModule) throw new Error('AudioWorklet is unavailable in this environment.');
      await context.audioWorklet.addModule(this.workletUrl);
      assertCurrent();
      const node = new AudioWorkletNode(context, 'synzer-audio-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { maxVoices: this.maxVoices, engineId: this.engineId },
      });
      node.port.onmessage = ({ data }) => {
        if (data?.type !== 'ENGINE_ERROR') return;
        const error = new Error(String(data.message ?? 'AudioWorklet engine error.'));
        error.name = 'SynzerWorkletError';
        if (data.commandType !== undefined) error.commandType = data.commandType;
        if (data.voiceId !== undefined) {
          error.voiceId = data.voiceId;
          const note = this.handles.get(data.voiceId);
          if (this.handles.delete(data.voiceId)) {
            this.wavetableHandles.delete(data.voiceId);
            const stack = this.noteStacks.get(note) ?? [];
            const index = stack.indexOf(data.voiceId);
            if (index >= 0) stack.splice(index, 1);
            if (stack.length === 0) this.noteStacks.delete(note);
          }
        }
        this.onError?.(error);
      };
      node.onprocessorerror = () => {
        if (this.node !== node || this.processorFailure) return;
        const error = new Error('AudioWorklet processor failed; close and reinitialize the engine before sending more notes.');
        error.name = 'SynzerProcessorError';
        this.processorFailure = error;
        this.handles.clear();
        this.noteStacks.clear();
        this.onError?.(error);
      };
      try {
        node.connect(context.destination);
        assertCurrent();
        this.processorFailure = null;
        node.port.postMessage({ type: 'SET_PARAMETERS', parameters: this.engineId === 'fm' ? this.fmParameters : this.parameters });
        node.port.postMessage({ type: 'SET_EFFECT_PARAMETERS', parameters: this.effectParameters });
        node.port.postMessage({ type: 'SET_EFFECT_RACK', configuration: this.effectRackConfiguration });
        this.node = node;
      } catch (error) {
        node.disconnect();
        node.port.close();
        throw error;
      }
    })();
    this.initPromise = initialization;
    try { await initialization; }
    catch (error) {
      if (this.initPromise === initialization) this.initPromise = null;
      throw error;
    }
  }

  getParameters() {
    return { ...this.parameters };
  }

  setEngine(engineId) {
    if (!['virtual-analog', 'wavetable', 'fm'].includes(engineId)) throw new RangeError(`Unsupported synthesis engine: ${engineId}`);
    if (engineId === 'wavetable') engineId = 'virtual-analog';
    this.engineId = engineId;
    if (this.node && !this.processorFailure) {
      this.node.port.postMessage({ type: 'SET_ENGINE', engineId });
      this.node.port.postMessage({ type: 'SET_PARAMETERS', parameters: engineId === 'fm' ? this.fmParameters : this.parameters });
    }
    return this.engineId;
  }

  setFMParameters(values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('FM parameters must be an object.');
    this.fmParameters = { ...this.fmParameters, ...values };
    if (this.engineId === 'fm' && this.node && !this.processorFailure) this.node.port.postMessage({ type: 'SET_PARAMETERS', parameters: this.fmParameters });
    return { ...this.fmParameters };
  }

  getEffectParameters() {
    return { ...this.effectParameters };
  }

  getEffectRackConfiguration() {
    return normalizeEffectRackConfiguration({}, this.effectRackConfiguration);
  }

  setEffectRackConfiguration(configuration = {}) {
    const next = normalizeEffectRackConfiguration(configuration, this.effectRackConfiguration);
    this.effectRackConfiguration = next;
    if (this.node && !this.processorFailure) this.node.port.postMessage({ type: 'SET_EFFECT_RACK', configuration: next });
    return this.getEffectRackConfiguration();
  }

  setEffectParameters(values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Effect parameters must be an object.');
    const allowed = new Set(['time', 'feedback', 'mix', 'pingPong', 'roomSize', 'damping', 'reverbMix', 'width', 'preDelayMs', 'earlyLevel', 'modulationRateHz', 'modulationDepthMs']);
    for (const key of Object.keys(values)) if (!allowed.has(key)) throw new TypeError(`Unknown effect parameter: ${key}`);
    const next = { ...this.effectParameters, ...values };
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
    this.effectParameters = next;
    if (this.node && !this.processorFailure) this.node.port.postMessage({ type: 'SET_EFFECT_PARAMETERS', parameters: next });
    return this.getEffectParameters();
  }

  setParameters(values = {}) {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('Virtual Analog parameters must be an object.');
    }
    const next = normalizeVirtualAnalogParameters({ ...this.parameters, ...values });
    this.parameters = next;
    if (this.node && !this.processorFailure) {
      this.node.port.postMessage({ type: 'SET_PARAMETERS', parameters: next });
    }
    return this.getParameters();
  }

  async noteOn({ note, frequency, velocity = 1, waveform, envelope, wavetable } = {}) {
    await this.initialize();
    if (this.processorFailure) throw this.processorFailure;
    const voiceId = `synzer-voice-${++this.voiceSequence}`;
    const voice = { id: voiceId, note, frequency, velocity, ...(waveform === undefined ? {} : { waveform }), ...(envelope === undefined ? {} : { envelope }), ...(wavetable === undefined ? {} : { wavetable }) };
    this.node.port.postMessage({ type: 'NOTE_ON', voice });
    this.handles.set(voiceId, note);
    if (wavetable !== undefined && wavetable !== null) this.wavetableHandles.add(voiceId);
    const stack = this.noteStacks.get(note) ?? [];
    stack.push(voiceId);
    this.noteStacks.set(note, stack);
    return voiceId;
  }

  setWavetableMorph(voiceId, morph) {
    if (!Number.isFinite(morph) || morph < 0 || morph > 1) throw new RangeError('Wavetable morph must be between 0 and 1.');
    if (!this.handles.has(voiceId) || !this.wavetableHandles.has(voiceId)) return false;
    if (this.node && !this.processorFailure) this.node.port.postMessage({ type: 'SET_WAVETABLE_MORPH', voiceId, morph });
    return true;
  }

  async noteOff(voiceId) {
    if (!this.handles.has(voiceId)) return false;
    await this.initialize();
    if (this.processorFailure) throw this.processorFailure;
    if (!this.handles.has(voiceId)) return false;
    this.node.port.postMessage({ type: 'NOTE_OFF', voiceId });
    const note = this.handles.get(voiceId);
    this.handles.delete(voiceId);
    this.wavetableHandles.delete(voiceId);
    const stack = this.noteStacks.get(note) ?? [];
    const index = stack.indexOf(voiceId);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) this.noteStacks.delete(note);
    return true;
  }

  async noteOffMostRecent(note) {
    const stack = this.noteStacks.get(note);
    if (!stack?.length) return false;
    return this.noteOff(stack[stack.length - 1]);
  }

  async close() {
    this.lifecycleGeneration++;
    const context = this.context;
    const node = this.node;
    this.node = null;
    this.context = null;
    this.initPromise = null;
    this.resumePromise = null;
    this.processorFailure = null;
    if (node) { node.disconnect(); node.port.close(); }
    this.handles.clear();
    this.wavetableHandles.clear();
    this.noteStacks.clear();
    if (context && context.state !== 'closed') await context.close();
  }
}
