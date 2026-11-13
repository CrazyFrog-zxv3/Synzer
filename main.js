import { SynzerEngine } from './packages/dsp-engine/src/core/SynzerEngine.js';
import {
  createVirtualAnalogPatch,
  applyVirtualAnalogPatch,
  savePatch,
  listPatches,
  loadPatch,
} from './packages/dsp-engine/src/core/PatchStore.js';

const state = document.querySelector('#state');
const stateLabel = state.querySelector('span:last-child');
const message = document.querySelector('#message');
const voiceCount = document.querySelector('#voice-count');
const workletState = document.querySelector('#worklet-state');
const keyboard = document.querySelector('#keyboard');
const activePointers = new Map();

const engine = new SynzerEngine({
  maxVoices: 12,
  onError: (error) => {
    message.textContent = `Erro no processador de áudio: ${error.message}`;
    workletState.textContent = 'WORKLET ERROR';
    stateLabel.textContent = 'ENGINE ERROR';
    state.classList.remove('on');
  },
});

let observedAudioContext = null;

function renderAudioLifecycle() {
  const context = engine.context;
  if (!context) return;

  const isRunning = context.state === 'running';
  state.classList.toggle('on', isRunning && !document.hidden);

  if (document.hidden) {
    stateLabel.textContent = isRunning ? 'APP BACKGROUND · ENGINE RUNNING' : `APP BACKGROUND · AUDIO ${context.state.toUpperCase()}`;
    return;
  }

  if (context.state === 'running') {
    stateLabel.textContent = 'ENGINE READY';
    workletState.textContent = 'AUDIOWORKLET READY';
  } else if (context.state === 'suspended') {
    stateLabel.textContent = 'AUDIO SUSPENDED · TOUCH TO RESUME';
    workletState.textContent = 'AUDIO SUSPENDED';
    message.textContent = 'O navegador suspendeu o áudio. Toque no teclado para retomar.';
  } else if (context.state === 'closed') {
    stateLabel.textContent = 'ENGINE CLOSED · TOUCH TO RESTART';
    workletState.textContent = 'CLOSED';
  } else {
    stateLabel.textContent = `AUDIO ${context.state.toUpperCase()}`;
    workletState.textContent = context.state.toUpperCase();
  }
}

function observeAudioContext(context) {
  if (!context || context === observedAudioContext) return;
  observedAudioContext = context;
  context.addEventListener('statechange', renderAudioLifecycle);
  renderAudioLifecycle();
}

document.addEventListener('visibilitychange', renderAudioLifecycle);
window.addEventListener('pageshow', renderAudioLifecycle);

const midiNotes = Array.from({ length: 13 }, (_, index) => 60 + index);
const whiteOffsets = [0, 2, 4, 5, 7, 9, 11, 12];
const whiteLabels = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const blackKeys = [
  { offset: 1, left: 8.75, label: 'C♯' },
  { offset: 3, left: 21.25, label: 'D♯' },
  { offset: 6, left: 46.25, label: 'F♯' },
  { offset: 8, left: 58.75, label: 'G♯' },
  { offset: 10, left: 71.25, label: 'A♯' },
];

function frequencyForMidi(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

function readWaveform() {
  return document.querySelector('#waveform').value;
}

function readSynthParameters() {
  return {
    'global.master-level': Number(document.querySelector('#master-level').value) / 100,
    'engine.virtual-analog.osc-wave': readWaveform(),
    'engine.virtual-analog.amp-attack': Number(document.querySelector('#attack').value) / 1000,
    'engine.virtual-analog.amp-decay': Number(document.querySelector('#decay').value) / 1000,
    'engine.virtual-analog.amp-sustain': Number(document.querySelector('#sustain').value) / 100,
    'engine.virtual-analog.amp-release': Number(document.querySelector('#release').value) / 1000,
    'engine.virtual-analog.filter-mode': document.querySelector('#filter-mode').value,
    'engine.virtual-analog.filter-cutoff': Math.round(20 * (1000 ** (Number(document.querySelector('#filter-cutoff').value) / 1000))),
    'engine.virtual-analog.filter-resonance': Number(document.querySelector('#filter-resonance').value) / 100,
  };
}

function applySynthParameters() {
  try {
    engine.setParameters(readSynthParameters());
  } catch (error) {
    message.textContent = `Parâmetros rejeitados: ${error.message}`;
  }
}

function setWaveform(waveform) {
  const select = document.querySelector('#waveform');
  select.value = waveform;
  document.querySelectorAll('[data-wave]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.wave === waveform));
  });
  updateWaveformScope(waveform);
  applySynthParameters();
}

function updateWaveformScope(waveform) {
  const path = document.querySelector('#wave-path');
  if (!path) return;

  if (waveform === 'sine') {
    path.setAttribute('d', 'M0 90 C40 10 80 10 120 90 S200 170 240 90 S320 10 360 90 S440 170 480 90 S560 10 600 90 S640 130 640 90');
  } else if (waveform === 'square') {
    path.setAttribute('d', 'M0 145 H80 V35 H160 V145 H240 V35 H320 V145 H400 V35 H480 V145 H560 V35 H640');
  } else {
    path.setAttribute('d', 'M0 150 L80 30 V150 L160 30 V150 L240 30 V150 L320 30 V150 L400 30 V150 L480 30 V150 L560 30 V150 L640 30');
  }
}

function updateEnvelopeGraph() {
  const attack = Number(document.querySelector('#attack').value);
  const decay = Number(document.querySelector('#decay').value);
  const sustain = Number(document.querySelector('#sustain').value) / 100;
  const release = Number(document.querySelector('#release').value);

  const attackX = 28 + (attack / 1000) * 120;
  const decayX = attackX + 44 + (decay / 2000) * 116;
  const sustainY = 180 - (sustain * 145);
  const releaseStartX = Math.min(490, Math.max(410, decayX + 110));
  const releaseEndX = 585 - (release / 3000) * 36;
  const path = `M0 180 L${attackX} 18 L${decayX} ${sustainY} L${releaseStartX} ${sustainY} L${releaseEndX} 180`;

  document.querySelector('#env-path').setAttribute('d', path);
  document.querySelector('#env-fill').setAttribute('d', `${path} Z`);
  document.querySelector('#env-a').setAttribute('cx', String(attackX));
  document.querySelector('#env-a').setAttribute('cy', '18');
  document.querySelector('#env-d').setAttribute('cx', String(decayX));
  document.querySelector('#env-d').setAttribute('cy', String(sustainY));
  document.querySelector('#env-r').setAttribute('cx', String(releaseEndX));
}

function syncHeldKeys() {
  const held = [...activePointers.values()].filter((record) => record.voiceId && !record.released).length;
  voiceCount.textContent = String(held);
}

function releasePointer(pointerId) {
  const record = activePointers.get(pointerId);
  if (!record || record.released) return;

  record.released = true;
  record.button.classList.remove('down');

  if (record.voiceId) {
    engine.noteOff(record.voiceId).catch((error) => {
      message.textContent = `Falha ao liberar nota: ${error.message}`;
    });
    activePointers.delete(pointerId);
  }
  syncHeldKeys();
}

function createKey(note, kind, left, width, label) {
  const button = document.createElement('button');
  button.className = `key ${kind}`;
  button.type = 'button';
  button.style.left = `${left}%`;
  button.style.width = `${width}%`;
  button.textContent = label;
  button.setAttribute('aria-label', `Nota MIDI ${note}`);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try { button.setPointerCapture(event.pointerId); } catch {}
    button.classList.add('down');

    const record = { button, released: false, voiceId: null };
    activePointers.set(event.pointerId, record);
    syncHeldKeys();

    applySynthParameters();
    engine.noteOn({
      note,
      frequency: frequencyForMidi(note),
      velocity: 0.85,
    }).then(async (voiceId) => {
      record.voiceId = voiceId;
      observeAudioContext(engine.context);

      if (record.released) {
        await engine.noteOff(voiceId);
        if (activePointers.get(event.pointerId) === record) {
          activePointers.delete(event.pointerId);
        }
      } else {
        message.textContent = `Nota MIDI ${note} ativa · ${readWaveform().toUpperCase()}`;
      }
      syncHeldKeys();
    }).catch((error) => {
      if (activePointers.get(event.pointerId) === record) {
        activePointers.delete(event.pointerId);
      }
      button.classList.remove('down');
      syncHeldKeys();
      message.textContent = `Falha ao iniciar áudio: ${error.message}`;
      workletState.textContent = 'WORKLET FAILED';
      state.classList.remove('on');
      stateLabel.textContent = 'ENGINE OFF';
    });
  });

  button.addEventListener('pointerup', (event) => releasePointer(event.pointerId));
  button.addEventListener('pointercancel', (event) => releasePointer(event.pointerId));
  button.addEventListener('lostpointercapture', (event) => releasePointer(event.pointerId));
  return button;
}

// White keys are rendered first. Black keys are layered above them like a piano.
whiteOffsets.forEach((offset, index) => {
  keyboard.append(createKey(60 + offset, 'white', index * 12.5, 12.5, whiteLabels[index]));
});
blackKeys.forEach(({ offset, left, label }) => {
  keyboard.append(createKey(60 + offset, 'black', left, 7.5, label));
});

// The editor tabs are navigation only; future DSP modules are clearly marked as planned.
document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((item) => {
      item.setAttribute('aria-selected', String(item === tab));
    });
    document.querySelectorAll('[data-view]').forEach((view) => {
      view.hidden = view.dataset.view !== target;
    });
  });
});

document.querySelectorAll('[data-wave]').forEach((button) => {
  button.addEventListener('click', () => setWaveform(button.dataset.wave));
});

for (const [id, unit] of [
  ['attack', 'ms'],
  ['decay', 'ms'],
  ['sustain', '%'],
  ['release', 'ms'],
]) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-value`);
  input.addEventListener('input', () => {
    output.value = `${input.value}${unit}`;
    output.textContent = `${input.value}${unit}`;
    updateEnvelopeGraph();
    applySynthParameters();
  });
}

const masterLevel = document.querySelector('#master-level');
const masterLevelOutput = document.querySelector('#master-level-value');
masterLevel.addEventListener('input', () => {
  masterLevelOutput.value = `${masterLevel.value}%`;
  masterLevelOutput.textContent = `${masterLevel.value}%`;
  applySynthParameters();
});

const filterMode = document.querySelector('#filter-mode');
const filterCutoff = document.querySelector('#filter-cutoff');
const filterCutoffOutput = document.querySelector('#filter-cutoff-value');
const filterResonance = document.querySelector('#filter-resonance');
const filterResonanceOutput = document.querySelector('#filter-resonance-value');

filterMode.addEventListener('change', applySynthParameters);
filterCutoff.addEventListener('input', () => {
  const cutoff = Math.round(20 * (1000 ** (Number(filterCutoff.value) / 1000)));
  filterCutoffOutput.value = cutoff >= 1000 ? `${(cutoff / 1000).toFixed(2)} kHz` : `${cutoff} Hz`;
  filterCutoffOutput.textContent = filterCutoffOutput.value;
  applySynthParameters();
});
filterResonance.addEventListener('input', () => {
  filterResonanceOutput.value = `${(Number(filterResonance.value) / 100).toFixed(2)} Q`;
  filterResonanceOutput.textContent = filterResonanceOutput.value;
  applySynthParameters();
});

const patchNameInput = document.querySelector('#patch-name');
const patchTitle = document.querySelector('#current-patch-title');
const patchSelect = document.querySelector('#patch-select');
const savePatchButton = document.querySelector('#save-patch');
const loadPatchButton = document.querySelector('#load-patch');

function refreshPatchList(selectedName = '') {
  const names = listPatches(localStorage);
  patchSelect.replaceChildren(new Option('Saved patches', ''));
  for (const name of names) patchSelect.add(new Option(name, name));
  patchSelect.value = selectedName;
  loadPatchButton.disabled = names.length === 0 || !patchSelect.value;
}

patchSelect.addEventListener('change', () => {
  loadPatchButton.disabled = !patchSelect.value;
});

savePatchButton.addEventListener('click', () => {
  try {
    const name = patchNameInput.value.trim();
    const patch = createVirtualAnalogPatch(engine.getParameters(), name);
    savePatch(localStorage, patch);
    patchNameInput.value = patch.name;
    patchTitle.textContent = patch.name;
    refreshPatchList(patch.name);
    message.textContent = `Patch "${patch.name}" salvo localmente neste navegador.`;
  } catch (error) {
    message.textContent = `Não foi possível salvar o patch: ${error.message}`;
  }
});

loadPatchButton.addEventListener('click', () => {
  try {
    if (!patchSelect.value) return;
    const patch = loadPatch(localStorage, patchSelect.value);
    const parameters = applyVirtualAnalogPatch(patch);
    masterLevel.value = String(Math.round(parameters['global.master-level'] * 100));
    masterLevelOutput.value = `${masterLevel.value}%`;
    masterLevelOutput.textContent = `${masterLevel.value}%`;
    document.querySelector('#attack').value = String(Math.round(parameters['engine.virtual-analog.amp-attack'] * 1000));
    document.querySelector('#decay').value = String(Math.round(parameters['engine.virtual-analog.amp-decay'] * 1000));
    document.querySelector('#sustain').value = String(Math.round(parameters['engine.virtual-analog.amp-sustain'] * 100));
    document.querySelector('#release').value = String(Math.round(parameters['engine.virtual-analog.amp-release'] * 1000));
    filterMode.value = parameters['engine.virtual-analog.filter-mode'];
    filterCutoff.value = String(Math.round(Math.log(parameters['engine.virtual-analog.filter-cutoff'] / 20) / Math.log(1000) * 1000));
    filterCutoffOutput.value = parameters['engine.virtual-analog.filter-cutoff'] >= 1000 ? `${(parameters['engine.virtual-analog.filter-cutoff'] / 1000).toFixed(2)} kHz` : `${Math.round(parameters['engine.virtual-analog.filter-cutoff'])} Hz`;
    filterCutoffOutput.textContent = filterCutoffOutput.value;
    filterResonance.value = String(Math.round(parameters['engine.virtual-analog.filter-resonance'] * 100));
    filterResonanceOutput.value = `${parameters['engine.virtual-analog.filter-resonance'].toFixed(2)} Q`;
    filterResonanceOutput.textContent = filterResonanceOutput.value;
    for (const [id, unit] of [['attack', 'ms'], ['decay', 'ms'], ['sustain', '%'], ['release', 'ms']]) {
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      output.value = `${input.value}${unit}`;
      output.textContent = `${input.value}${unit}`;
    }
    updateEnvelopeGraph();
    setWaveform(parameters['engine.virtual-analog.osc-wave']);
    engine.setParameters(parameters);
    patchNameInput.value = patch.name;
    patchTitle.textContent = patch.name;
    message.textContent = `Patch "${patch.name}" carregado. Parâmetros aplicados ao motor.`;
  } catch (error) {
    message.textContent = `Não foi possível carregar o patch: ${error.message}`;
  }
});

try {
  refreshPatchList();
} catch (error) {
  message.textContent = `Armazenamento local indisponível: ${error.message}`;
}

document.querySelector('#stop-all').addEventListener('click', () => {
  for (const pointerId of [...activePointers.keys()]) releasePointer(pointerId);
  message.textContent = 'Notas liberadas. As caudas ADSR continuam até o fim do release.';
});

setWaveform('saw');
updateEnvelopeGraph();
syncHeldKeys();

window.addEventListener('pagehide', async () => {
  for (const record of activePointers.values()) {
    record.released = true;
    record.button.classList.remove('down');
  }
  activePointers.clear();
  syncHeldKeys();

  state.classList.remove('on');
  stateLabel.textContent = 'ENGINE CLOSING';
  workletState.textContent = 'CLOSING';
  message.textContent = 'Fechando o motor de áudio ao sair desta página.';

  try {
    await engine.close();
    stateLabel.textContent = 'ENGINE CLOSED · TOUCH TO RESTART';
    workletState.textContent = 'CLOSED';
    message.textContent = 'Motor fechado. Ao voltar, toque no teclado para reinicializar o áudio.';
  } catch (error) {
    stateLabel.textContent = 'ENGINE CLOSE ERROR';
    workletState.textContent = 'CLOSE ERROR';
    message.textContent = `Falha ao fechar o motor: ${error.message}`;
  }
});
