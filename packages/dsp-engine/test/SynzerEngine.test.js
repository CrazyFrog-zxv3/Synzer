import test from 'node:test';
import assert from 'node:assert/strict';
import { SynzerEngine } from '../src/core/SynzerEngine.js';

function createHarness({ addModule = async () => {}, onError = null, contextFactory } = {}) {
  const messages = [];
  const counters = { resume: 0, addModule: 0, connect: 0, disconnect: 0, portClose: 0, contextClose: 0 };
  const context = {
    state: 'suspended',
    destination: {},
    audioWorklet: {
      async addModule(url) {
        counters.addModule++;
        return addModule(url);
      },
    },
    async resume() { counters.resume++; this.state = 'running'; },
    async close() { counters.contextClose++; this.state = 'closed'; },
  };

  class FakeAudioWorkletNode {
    constructor(receivedContext, name, options) {
      assert.equal(receivedContext, context);
      assert.equal(name, 'synzer-audio-processor');
      assert.equal(options.processorOptions.maxVoices, 8);
      this.port = {
        onmessage: null,
        postMessage(message) { messages.push(message); },
        close() { counters.portClose++; },
      };
      this.onprocessorerror = null;
    }
    connect(destination) { assert.equal(destination, context.destination); counters.connect++; }
    disconnect() { counters.disconnect++; }
  }

  const previousNode = globalThis.AudioWorkletNode;
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  const engine = new SynzerEngine({
    audioContextFactory: contextFactory ?? (() => context),
    workletUrl: 'test-worklet.js',
    maxVoices: 8,
    onError,
  });
  return {
    engine, context, messages, counters,
    restore() {
      if (previousNode === undefined) delete globalThis.AudioWorkletNode;
      else globalThis.AudioWorkletNode = previousNode;
    },
  };
}

test('concurrent initialization shares one AudioContext and one worklet node', async () => {
  const h = createHarness();
  try {
    await Promise.all([h.engine.initialize(), h.engine.initialize(), h.engine.initialize()]);
    assert.equal(h.counters.resume, 1);
    assert.equal(h.counters.addModule, 1);
    assert.equal(h.counters.connect, 1);
  } finally { await h.engine.close(); h.restore(); }
});

test('noteOn and noteOff preserve voice identifiers and message order', async () => {
  const h = createHarness();
  try {
    const voiceId = await h.engine.noteOn({ note: 60, frequency: 261.6256, velocity: 0.7, waveform: 'sine' });
    assert.equal(h.messages.length, 4);
    assert.equal(h.messages[0].type, 'SET_PARAMETERS');
    assert.equal(h.messages[1].type, 'SET_EFFECT_PARAMETERS');
    assert.equal(h.messages[2].type, 'SET_EFFECT_RACK');
    assert.equal(h.messages[3].type, 'NOTE_ON');
    assert.equal(h.messages[3].voice.id, voiceId);
    assert.equal(h.messages[3].voice.note, 60);
    assert.equal(await h.engine.noteOff(voiceId), true);
    assert.deepEqual(h.messages[4], { type: 'NOTE_OFF', voiceId });
    assert.equal(await h.engine.noteOff(voiceId), false);
  } finally { await h.engine.close(); h.restore(); }
});

test('noteOffMostRecent releases repeated notes in last-in-first-out order', async () => {
  const h = createHarness();
  try {
    const first = await h.engine.noteOn({ note: 64, frequency: 329.63 });
    const second = await h.engine.noteOn({ note: 64, frequency: 329.63 });
    assert.equal(await h.engine.noteOffMostRecent(64), true);
    assert.equal(h.messages.at(-1).voiceId, second);
    assert.equal(await h.engine.noteOffMostRecent(64), true);
    assert.equal(h.messages.at(-1).voiceId, first);
    assert.equal(await h.engine.noteOffMostRecent(64), false);
  } finally { await h.engine.close(); h.restore(); }
});

test('close disconnects and closes owned resources and clears voice handles', async () => {
  const h = createHarness();
  try {
    const voiceId = await h.engine.noteOn({ note: 67, frequency: 391.995 });
    await h.engine.close();
    assert.equal(h.counters.disconnect, 1);
    assert.equal(h.counters.portClose, 1);
    assert.equal(h.counters.contextClose, 1);
    assert.equal(h.context.state, 'closed');
    assert.equal(await h.engine.noteOff(voiceId), false);
  } finally { h.restore(); }
});

test('worklet messages surface errors and discard stale voice handles', async () => {
  const errors = [];
  const h = createHarness({ onError: (error) => errors.push(error) });
  try {
    const voiceId = await h.engine.noteOn({ note: 69, frequency: 440 });
    h.engine.node.port.onmessage({ data: { type: 'ENGINE_ERROR', message: 'Rejected test voice', commandType: 'NOTE_ON', voiceId } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].name, 'SynzerWorkletError');
    assert.equal(errors[0].commandType, 'NOTE_ON');
    assert.equal(await h.engine.noteOff(voiceId), false);
  } finally { await h.engine.close(); h.restore(); }
});

test('processorerror is surfaced, clears handles, and blocks commands until close', async () => {
  const errors = [];
  const h = createHarness({ onError: (error) => errors.push(error) });
  try {
    const voiceId = await h.engine.noteOn({ note: 69, frequency: 440 });
    h.engine.node.onprocessorerror();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].name, 'SynzerProcessorError');
    assert.equal(await h.engine.noteOff(voiceId), false);
    await assert.rejects(() => h.engine.noteOn({ note: 70, frequency: 466.16 }), { name: 'SynzerProcessorError' });
  } finally { await h.engine.close(); h.restore(); }
});

test('failed worklet loading can be retried without creating duplicate nodes', async () => {
  let attempts = 0;
  const h = createHarness({ addModule: async () => { attempts++; if (attempts === 1) throw new Error('simulated module load failure'); } });
  try {
    await assert.rejects(() => h.engine.initialize(), /simulated module load failure/);
    assert.equal(h.engine.node, null);
    await h.engine.initialize();
    assert.equal(attempts, 2);
    assert.equal(h.counters.connect, 1);
  } finally { await h.engine.close(); h.restore(); }
});

test('close during asynchronous worklet loading invalidates initialization safely', async () => {
  let resolveModule;
  const pendingModule = new Promise((resolve) => { resolveModule = resolve; });
  const h = createHarness({ addModule: () => pendingModule });
  try {
    const initialization = h.engine.initialize();
    await Promise.resolve();
    await h.engine.close();
    resolveModule();
    await assert.rejects(initialization, /closed during initialization/);
    assert.equal(h.engine.node, null);
    assert.equal(h.context.state, 'closed');
    assert.equal(h.counters.connect, 0);
  } finally { h.restore(); }
});


test('reuses the existing worklet node but resumes a suspended AudioContext', async () => {
  const h = createHarness();
  try {
    await h.engine.initialize();
    assert.equal(h.context.state, 'running');
    h.context.state = 'suspended';
    h.counters.resume = 0;

    await h.engine.initialize();

    assert.equal(h.counters.resume, 1);
    assert.equal(h.context.state, 'running');
    assert.equal(h.counters.addModule, 1);
    assert.equal(h.counters.connect, 1);
  } finally { await h.engine.close(); h.restore(); }
});


test('parameter updates are validated, retained before initialization and sent to the Worklet', async () => {
  const h = createHarness();
  try {
    const beforeInit = h.engine.setParameters({
      'global.master-level': 0.4,
      'engine.virtual-analog.osc-wave': 'square',
    });
    assert.equal(beforeInit['global.master-level'], 0.4);
    assert.equal(h.messages.length, 0);
    await h.engine.initialize();
    assert.equal(h.messages[0].type, 'SET_PARAMETERS');
    assert.equal(h.messages[0].parameters['global.master-level'], 0.4);
    assert.equal(h.messages[0].parameters['engine.virtual-analog.osc-wave'], 'square');
    assert.equal(h.messages[1].type, 'SET_EFFECT_PARAMETERS');
    assert.equal(h.messages[2].type, 'SET_EFFECT_RACK');
    h.engine.setParameters({ 'global.master-level': 0.2 });
    assert.equal(h.messages[3].type, 'SET_PARAMETERS');
    assert.equal(h.messages[3].parameters['global.master-level'], 0.2);
    assert.throws(() => h.engine.setParameters({ 'global.master-level': 2 }), /range/i);
    assert.equal(h.engine.getParameters()['global.master-level'], 0.2);
  } finally { await h.engine.close(); h.restore(); }
});

test('SynzerEngine forwards per-voice wavetable definitions and live morph commands', async () => {
  const h = createHarness();
  try {
    const wavetable = { size: 256, morph: 0.25, partialFrames: [[{ harmonic: 1, amplitude: 1 }], [{ harmonic: 2, amplitude: 1 }]] };
    const voiceId = await h.engine.noteOn({ note: 60, frequency: 440, wavetable });
    assert.deepEqual(h.messages.at(-1).voice.wavetable, wavetable);
    const analogVoiceId = await h.engine.noteOn({ note: 62, frequency: 493.88 });
    assert.equal(h.engine.setWavetableMorph(voiceId, 0.75), true);
    assert.deepEqual(h.messages.at(-1), { type: 'SET_WAVETABLE_MORPH', voiceId, morph: 0.75 });
    assert.equal(h.engine.setWavetableMorph('missing', 0.5), false);
    assert.equal(h.engine.setWavetableMorph(analogVoiceId, 0.5), false);
    assert.throws(() => h.engine.setWavetableMorph(voiceId, -0.1), RangeError);
  } finally { await h.engine.close(); h.restore(); }
});


test('effect parameters persist before initialization and update the live worklet', async () => {
  const h = createHarness();
  try {
    const before = h.engine.setEffectParameters({ time: 0.5, feedback: 0.7, mix: 0.4, pingPong: true, roomSize: 0.86, damping: 0.62, reverbMix: 0.45, width: 0.9, preDelayMs: 55, earlyLevel: 0.72, modulationRateHz: 0.65, modulationDepthMs: 1.1 });
    assert.deepEqual(before, { time: 0.5, feedback: 0.7, mix: 0.4, pingPong: true, roomSize: 0.86, damping: 0.62, reverbMix: 0.45, width: 0.9, preDelayMs: 55, earlyLevel: 0.72, modulationRateHz: 0.65, modulationDepthMs: 1.1 });
    h.engine.setFMParameters({ 'engine.fm.algorithm': 2 });
    assert.deepEqual(h.engine.getEffectParameters(), before, 'FM edits must not reset the global FX bus');
    assert.equal(h.messages.length, 0);
    await h.engine.initialize();
    assert.equal(h.messages[1].type, 'SET_EFFECT_PARAMETERS');
    assert.deepEqual(h.messages[1].parameters, before);
    assert.equal(h.messages[2].type, 'SET_EFFECT_RACK');
    h.engine.setEffectParameters({ mix: 0.2 });
    assert.equal(h.messages[3].type, 'SET_EFFECT_PARAMETERS');
    assert.equal(h.messages[3].parameters.mix, 0.2);
    assert.equal(h.messages[3].parameters.reverbMix, 0.45);
    assert.throws(() => h.engine.setEffectParameters({ roomSize: 1 }), /roomSize/i);
    assert.throws(() => h.engine.setEffectParameters({ reverbMix: -0.1 }), /reverb mix/i);
    assert.throws(() => h.engine.setEffectParameters({ preDelayMs: 201 }), /preDelayMs/i);
    assert.throws(() => h.engine.setEffectParameters({ earlyLevel: 1.1 }), /earlyLevel/i);
    assert.throws(() => h.engine.setEffectParameters({ modulationRateHz: 2.1 }), /modulationRateHz/i);
    assert.throws(() => h.engine.setEffectParameters({ modulationDepthMs: 2.1 }), /modulationDepthMs/i);
    assert.throws(() => h.engine.setEffectParameters({ feedback: 1 }), /feedback/i);
    assert.throws(() => h.engine.setEffectParameters({ reverb: 0.5 }), /unknown effect parameter/i);
    assert.equal(h.engine.getEffectParameters().feedback, 0.7);
  } finally { await h.engine.close(); h.restore(); }
});


test('effect rack configuration is retained before initialization and sent to the live worklet', async () => {
  const h = createHarness();
  try {
    const config = h.engine.setEffectRackConfiguration({ order: ['reverb', 'delay'], enabled: { delay: false } });
    assert.deepEqual(config, { order: ['reverb', 'delay'], enabled: { delay: false, reverb: true } });
    assert.deepEqual(h.engine.getEffectRackConfiguration(), config);
    await h.engine.initialize();
    assert.deepEqual(h.messages[2], { type: 'SET_EFFECT_RACK', configuration: config });
    h.engine.setEffectRackConfiguration({ enabled: { reverb: false } });
    assert.deepEqual(h.messages[3], { type: 'SET_EFFECT_RACK', configuration: { order: ['reverb', 'delay'], enabled: { delay: false, reverb: false } } });
    assert.throws(() => h.engine.setEffectRackConfiguration({ order: ['delay', 'delay'] }), /order/i);
    assert.throws(() => h.engine.setEffectRackConfiguration({ enabled: { delay: 1 } }), /enabled/i);
    assert.throws(() => h.engine.setEffectRackConfiguration({ enabled: { chorus: true } }), /unknown/i);
    assert.deepEqual(h.engine.getEffectRackConfiguration().order, ['reverb', 'delay']);
  } finally { await h.engine.close(); h.restore(); }
});
