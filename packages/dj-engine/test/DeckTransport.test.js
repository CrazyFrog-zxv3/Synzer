import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckTransport } from '../src/core/DeckTransport.js';

class FakeGain {
  constructor() { this.gain = { value: 1 }; this.connections = []; }
  connect(target) { this.connections.push(target); }
  disconnect() { this.connections = []; }
}

class FakeSource {
  constructor() { this.playbackRate = { value: 1 }; this.connections = []; this.started = null; this.stopped = false; this.onended = null; }
  connect(target) { this.connections.push(target); }
  disconnect() { this.connections = []; }
  start(when, offset) { this.started = { when, offset }; }
  stop() { this.stopped = true; }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.sources = [];
    this.decodeCalls = 0;
    this.decodeImpl = async () => ({ duration: 120, sampleRate: 48000, numberOfChannels: 2 });
    this.resumes = 0;
  }
  createGain() { return new FakeGain(); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  async decodeAudioData(data) { this.decodeCalls++; return this.decodeImpl(data); }
  async resume() { this.resumes++; this.state = 'running'; }
}

function fixture() {
  const context = new FakeAudioContext();
  const deck = new DeckTransport({ audioContext: context });
  return { context, deck };
}

async function load(deck) {
  return deck.loadArrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer);
}

test('loads and decodes an audio buffer', async () => {
  const { context, deck } = fixture();
  assert.equal(await load(deck), true);
  assert.equal(context.decodeCalls, 1);
  assert.equal(deck.isLoaded, true);
  assert.equal(deck.duration, 120);
  assert.equal(deck.snapshot().status, 'loaded');
});

test('starts playback at the stored position and resumes a suspended context', async () => {
  const { context, deck } = fixture();
  await load(deck);
  context.state = 'suspended';
  assert.equal(await deck.play(), true);
  assert.equal(context.resumes, 1);
  assert.deepEqual(context.sources[0].started, { when: 0, offset: 0 });
  assert.equal(deck.isPlaying, true);
});

test('pause preserves position using playback rate', async () => {
  const { context, deck } = fixture();
  await load(deck);
  await deck.play();
  deck.setRate(1.5);
  context.currentTime = 4;
  assert.equal(deck.pause(), true);
  assert.equal(deck.position, 6);
  assert.equal(deck.snapshot().status, 'paused');
  assert.equal(context.sources[0].stopped, true);
});

test('play resumes from paused position', async () => {
  const { context, deck } = fixture();
  await load(deck);
  await deck.seek(23);
  await deck.play();
  assert.deepEqual(context.sources[0].started, { when: 0, offset: 23 });
});

test('seek while playing restarts source at requested offset', async () => {
  const { context, deck } = fixture();
  await load(deck);
  await deck.play();
  assert.equal(await deck.seek(41), true);
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[0].stopped, true);
  assert.deepEqual(context.sources[1].started, { when: 0, offset: 41 });
  assert.equal(deck.isPlaying, true);
});

test('rate and gain enforce finite bounded values', async () => {
  const { deck } = fixture();
  await load(deck);
  assert.equal(deck.setRate(1.25), 1.25);
  assert.equal(deck.setGain(0.7), 0.7);
  assert.throws(() => deck.setRate(0), RangeError);
  assert.throws(() => deck.setRate(Number.NaN), RangeError);
  assert.throws(() => deck.setGain(2.1), RangeError);
});

test('stop resets the deck to the beginning', async () => {
  const { context, deck } = fixture();
  await load(deck);
  await deck.play();
  context.currentTime = 10;
  deck.stop();
  assert.equal(deck.position, 0);
  assert.equal(deck.snapshot().status, 'loaded');
  assert.equal(context.sources[0].stopped, true);
});

test('ignores stale decode completion when a newer load wins', async () => {
  const { context, deck } = fixture();
  let resolveFirst;
  context.decodeImpl = () => new Promise((resolve) => { resolveFirst = resolve; });
  const first = deck.loadArrayBuffer(new Uint8Array([1]).buffer);
  context.decodeImpl = async () => ({ duration: 30, sampleRate: 48000, numberOfChannels: 2 });
  const second = deck.loadArrayBuffer(new Uint8Array([2]).buffer);
  assert.equal(await second, true);
  resolveFirst({ duration: 90, sampleRate: 48000, numberOfChannels: 2 });
  assert.equal(await first, false);
  assert.equal(deck.duration, 30);
});

test('natural end updates the deck state', async () => {
  const { context, deck } = fixture();
  await load(deck);
  await deck.play();
  context.sources[0].onended();
  assert.equal(deck.snapshot().status, 'ended');
  assert.equal(deck.position, 120);
});

test('dispose releases owned nodes and rejects later operations', async () => {
  const { context, deck } = fixture();
  await load(deck);
  await deck.play();
  deck.dispose();
  assert.equal(context.sources[0].stopped, true);
  assert.equal(deck.snapshot().status, 'disposed');
  assert.throws(() => deck.stop(), /disposed/);
});
