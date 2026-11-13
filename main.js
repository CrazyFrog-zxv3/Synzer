import { SynzerEngine } from './packages/dsp-engine/src/core/SynzerEngine.js';

const state = document.querySelector('#state');
const message = document.querySelector('#message');
const voiceCount = document.querySelector('#voice-count');
const workletState = document.querySelector('#worklet-state');
const keyboard = document.querySelector('#keyboard');
const activePointers = new Map();
const engine = new SynzerEngine({
  maxVoices: 12,
  onError: (error) => {
    message.textContent = `Erro no processador de áudio: ${error.message}`;
    workletState.textContent = 'Erro no processador';
    state.textContent = 'API COM ERRO';
    state.classList.remove('on');
  },
});
let triggered = 0;
const midiNotes = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];

const readWaveform = () => document.querySelector('#waveform').value;

const readEnvelope = () => ({
  attack: Number(document.querySelector('#attack').value) / 1000,
  decay: Number(document.querySelector('#decay').value) / 1000,
  sustain: Number(document.querySelector('#sustain').value) / 100,
  release: Number(document.querySelector('#release').value) / 1000,
});

for (const [id, unit, divisor] of [['attack','ms',1],['decay','ms',1],['sustain','%',1],['release','ms',1]]) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-value`);
  input.addEventListener('input', () => { output.value = `${input.value}${unit}`; output.textContent = `${input.value}${unit}`; });
}

function frequencyForMidi(note) { return 440 * (2 ** ((note - 69) / 12)); }

function releasePointer(pointerId) {
  const record = activePointers.get(pointerId);
  if (!record) return;
  record.released = true;
  record.button.classList.remove('down');
  if (record.voiceId) {
    engine.noteOff(record.voiceId).catch((error) => { message.textContent = error.message; });
    activePointers.delete(pointerId);
  }
}

midiNotes.forEach((note) => {
  const button = document.createElement('button');
  button.className = 'key';
  button.type = 'button';
  button.textContent = `MIDI ${note}`;
  button.setAttribute('aria-label', `Nota MIDI ${note}`);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('down');
    const record = { button, released: false, voiceId: null };
    activePointers.set(event.pointerId, record);
    engine.noteOn({ note, frequency: frequencyForMidi(note), velocity: 0.85, waveform: readWaveform(), envelope: readEnvelope() }).then((voiceId) => {
      record.voiceId = voiceId;
      triggered++;
      voiceCount.textContent = String(triggered);
      state.textContent = 'API ATIVA';
      state.classList.add('on');
      workletState.textContent = 'Módulo carregado';
      if (record.released) {
        engine.noteOff(voiceId).catch((error) => { message.textContent = error.message; });
        activePointers.delete(event.pointerId);
      }
    }).catch((error) => {
      activePointers.delete(event.pointerId);
      button.classList.remove('down');
      message.textContent = `Falha ao iniciar áudio: ${error.message}`;
      workletState.textContent = 'Falha';
    });
  });
  button.addEventListener('pointerup', (event) => releasePointer(event.pointerId));
  button.addEventListener('pointercancel', (event) => releasePointer(event.pointerId));
  button.addEventListener('lostpointercapture', (event) => releasePointer(event.pointerId));
  keyboard.append(button);
});

document.querySelector('#stop-all').addEventListener('click', async () => {
  for (const pointerId of [...activePointers.keys()]) releasePointer(pointerId);
  message.textContent = 'Notas seguradas liberadas. Caudas de release continuam até terminar.';
});

window.addEventListener('pagehide', () => { engine.close().catch(() => {}); });
