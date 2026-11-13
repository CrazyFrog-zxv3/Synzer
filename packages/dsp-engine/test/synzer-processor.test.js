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
