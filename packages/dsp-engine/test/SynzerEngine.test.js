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
    assert.equal(h.messages.length, 1);
    assert.equal(h.messages[0].type, 'NOTE_ON');
    assert.equal(h.messages[0].voice.id, voiceId);
    assert.equal(h.messages[0].voice.note, 60);
    assert.equal(await h.engine.noteOff(voiceId), true);
    assert.deepEqual(h.messages[1], { type: 'NOTE_OFF', voiceId });
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
