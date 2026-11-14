import test from 'node:test';
import assert from 'node:assert/strict';

const registeredProcessors = new Map();
const processorErrors = [];

class FakeAudioWorkletProcessor {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage(message) { processorErrors.push(message); },
    };
  }
}

globalThis.AudioWorkletProcessor = FakeAudioWorkletProcessor;
globalThis.sampleRate = 8000;
globalThis.registerProcessor = (name, Processor) => registeredProcessors.set(name, Processor);

await import('../src/worklets/synzer-processor.js?processor-regression-test');

const Processor = registeredProcessors.get('synzer-audio-processor');

test('AudioWorklet registers and renders finite stereo audio from NOTE_ON', () => {
  assert.equal(typeof Processor, 'function');
  const processor = new Processor({ processorOptions: { maxVoices: 4 } });
  const left = new Float32Array(256);
  const right = new Float32Array(256);
  const extra = new Float32Array(256);

  processor.port.onmessage({
    data: {
      type: 'NOTE_ON',
      voice: {
        id: 'worklet-voice',
        note: 69,
        frequency: 440,
        velocity: 0.8,
        waveform: 'sine',
        envelope: { attack: 0, decay: 0, sustain: 1, release: 0.01 },
      },
    },
  });

  assert.equal(processor.process([], [[left, right, extra]]), true);
  assert.ok(left.some((sample) => sample !== 0));
  assert.deepEqual(right, left);
  assert.deepEqual(extra, left);
  assert.ok([...left, ...right, ...extra].every(Number.isFinite));
});

test('AudioWorklet reports invalid NOTE_ON commands through its message port', () => {
  processorErrors.length = 0;
  const processor = new Processor({ processorOptions: {} });

  processor.port.onmessage({
    data: {
      type: 'NOTE_ON',
      voice: {
        id: 'invalid-voice',
        note: 69,
        frequency: 440,
        waveform: 'triangle',
      },
    },
  });

  assert.equal(processorErrors.length, 1);
  assert.equal(processorErrors[0].type, 'ENGINE_ERROR');
  assert.equal(processorErrors[0].commandType, 'NOTE_ON');
  assert.equal(processorErrors[0].voiceId, 'invalid-voice');
});


test('AudioWorklet applies validated Virtual Analog parameters before rendering voices', () => {
  processorErrors.length = 0;
  const processor = new Processor({ processorOptions: {} });
  processor.port.onmessage({
    data: {
      type: 'SET_PARAMETERS',
      parameters: {
        'global.master-level': 0.3,
        'engine.virtual-analog.osc-wave': 'sine',
        'engine.virtual-analog.amp-attack': 0,
        'engine.virtual-analog.amp-decay': 0,
        'engine.virtual-analog.amp-sustain': 1,
        'engine.virtual-analog.amp-release': 0.01,
      },
    },
  });
  processor.port.onmessage({
    data: { type: 'NOTE_ON', voice: { id: 'parameter-voice', note: 69, frequency: 440 } },
  });
  assert.equal(processor.engine.getVoice('parameter-voice').waveform, 'sine');
  assert.equal(processor.engine.getVoice('parameter-voice').envelope.sustain, 1);
  const left = new Float32Array(256);
  processor.process([], [[left]]);
  assert.ok(left.some((sample) => sample !== 0));
  assert.ok([...left].every(Number.isFinite));
  assert.equal(processorErrors.length, 0);
});

test('AudioWorklet reports invalid parameter updates without corrupting engine state', () => {
  processorErrors.length = 0;
  const processor = new Processor({ processorOptions: {} });
  processor.port.onmessage({
    data: { type: 'SET_PARAMETERS', parameters: { 'global.master-level': 2 } },
  });
  assert.equal(processorErrors.length, 1);
  assert.equal(processorErrors[0].type, 'ENGINE_ERROR');
  assert.equal(processorErrors[0].commandType, 'SET_PARAMETERS');
  assert.equal(processor.engine.getParameters()['global.master-level'], 1);
});

test('AudioWorklet renders a Wavetable voice and applies live morph updates', () => {
  processorErrors.length = 0;
  const processor = new Processor({ processorOptions: {} });
  processor.port.onmessage({ data: { type: 'NOTE_ON', voice: {
    id: 'worklet-wavetable', note: 69, frequency: 440, velocity: 1,
    envelope: { attack: 0, decay: 0, sustain: 1, release: 0.01 },
    wavetable: { size: 256, morph: 0, partialFrames: [[{ harmonic: 1, amplitude: 1 }], [{ harmonic: 2, amplitude: 1 }]] },
  } } });
  const left = new Float32Array(256);
  processor.process([], [[left]]);
  assert.ok(left.some((sample) => sample !== 0));
  assert.ok([...left].every(Number.isFinite));
  processor.port.onmessage({ data: { type: 'SET_WAVETABLE_MORPH', voiceId: 'worklet-wavetable', morph: 1 } });
  assert.equal(processor.engine.getVoice('worklet-wavetable').wavetable.morph, 1);
  assert.equal(processorErrors.length, 0);
});


test('AudioWorklet instantiates and renders the four-operator FM engine', () => {
  processorErrors.length = 0;
  const processor = new Processor({ processorOptions: { engineId: 'fm', maxVoices: 4 } });
  processor.port.onmessage({ data: { type: 'SET_PARAMETERS', parameters: {
    'global.master-level': 0.7, 'engine.fm.algorithm': 2,
    'engine.fm.op1-attack': 0, 'engine.fm.op1-decay': 0, 'engine.fm.op1-sustain': 1,
    'engine.fm.op2-ratio': 2, 'engine.fm.op2-index': 6,
  } } });
  processor.port.onmessage({ data: { type: 'NOTE_ON', voice: { id: 'fm-worklet', note: 69, frequency: 440, velocity: 0.9 } } });
  const left = new Float32Array(512);
  const right = new Float32Array(512);
  processor.process([], [[left, right]]);
  assert.ok(left.some((sample) => Math.abs(sample) > 1e-5));
  assert.deepEqual(right, left);
  assert.ok([...left, ...right].every(Number.isFinite));
  assert.equal(processor.engineId, 'fm');
  assert.equal(processorErrors.length, 0);
});

test('AudioWorklet can switch from Virtual Analog to FM without rebuilding the node', () => {
  processorErrors.length = 0;
  const processor = new Processor({ processorOptions: { maxVoices: 4 } });
  processor.port.onmessage({ data: { type: 'SET_ENGINE', engineId: 'fm' } });
  processor.port.onmessage({ data: { type: 'SET_PARAMETERS', parameters: { 'engine.fm.algorithm': 4, 'engine.fm.op1-level': 1 } } });
  processor.port.onmessage({ data: { type: 'NOTE_ON', voice: { id: 'fm-switch', note: 60, frequency: 261.6256, velocity: 1 } } });
  const left = new Float32Array(256);
  processor.process([], [[left]]);
  assert.ok(left.some((sample) => Math.abs(sample) > 1e-5));
  assert.equal(processor.engineId, 'fm');
  assert.equal(processorErrors.length, 0);
});
