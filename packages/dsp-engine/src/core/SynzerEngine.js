import { createDefaultVirtualAnalogParameters, normalizeVirtualAnalogParameters } from './VirtualAnalogParameters.js';

export class SynzerEngine {
  constructor({ audioContextFactory = () => new AudioContext(), workletUrl = new URL('../worklets/synzer-processor.js', import.meta.url), maxVoices = 12, onError = null } = {}) {
    this.audioContextFactory = audioContextFactory;
    this.workletUrl = workletUrl;
    this.maxVoices = maxVoices;
    if (onError !== null && typeof onError !== 'function') throw new TypeError('onError must be a function when provided.');
    this.onError = onError;
    this.context = null;
    this.node = null;
    this.initPromise = null;
    this.resumePromise = null;
    this.voiceSequence = 0;
    this.handles = new Map();
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
        processorOptions: { maxVoices: this.maxVoices },
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
        this.node = node;
        node.port.postMessage({ type: 'SET_PARAMETERS', parameters: this.parameters });
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

  async noteOn({ note, frequency, velocity = 1, waveform, envelope } = {}) {
    await this.initialize();
    if (this.processorFailure) throw this.processorFailure;
    const voiceId = `synzer-voice-${++this.voiceSequence}`;
    const voice = { id: voiceId, note, frequency, velocity, ...(waveform === undefined ? {} : { waveform }), ...(envelope === undefined ? {} : { envelope }) };
    this.node.port.postMessage({ type: 'NOTE_ON', voice });
    this.handles.set(voiceId, note);
    const stack = this.noteStacks.get(note) ?? [];
    stack.push(voiceId);
    this.noteStacks.set(note, stack);
    return voiceId;
  }

  async noteOff(voiceId) {
    if (!this.handles.has(voiceId)) return false;
    await this.initialize();
    if (this.processorFailure) throw this.processorFailure;
    if (!this.handles.has(voiceId)) return false;
    this.node.port.postMessage({ type: 'NOTE_OFF', voiceId });
    const note = this.handles.get(voiceId);
    this.handles.delete(voiceId);
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
    this.noteStacks.clear();
    if (context && context.state !== 'closed') await context.close();
  }
}
