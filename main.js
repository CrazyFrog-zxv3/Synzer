import { SynzerEngine } from './packages/dsp-engine/src/core/SynzerEngine.js';
import { createDefaultWavetableDefinition } from './packages/dsp-engine/src/core/WavetablePresets.js';
import {
  createVirtualAnalogPatch,
  applyVirtualAnalogPatch,
  createFMEnginePatch,
  applyFMEnginePatch,
  applyPatchEffectParameters,
  applyPatchEffectRackConfiguration,
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

function readOscillatorSource() {
  return document.querySelector('#osc1-source').value;
}

function readWavetableMorph() {
  return Number(document.querySelector('#wavetable-morph').value) / 100;
}

function readFMParameters() {
  const parameters = {
    'global.master-level': Number(document.querySelector('#master-level').value) / 100,
    'engine.fm.algorithm': Number(document.querySelector('#fm-algorithm').value),
    'engine.fm.feedback': Number(document.querySelector('#fm-feedback').value) / 100,
  };
  for (let op = 1; op <= 4; op++) {
    parameters[`engine.fm.op${op}-ratio`] = Number(document.querySelector(`#fm-op${op}-ratio`).value);
    parameters[`engine.fm.op${op}-level`] = Number(document.querySelector(`#fm-op${op}-level`).value) / 100;
    parameters[`engine.fm.op${op}-index`] = Number(document.querySelector(`#fm-op${op}-index`).value);
    parameters[`engine.fm.op${op}-attack`] = Number(document.querySelector(`#fm-op${op}-attack`).value) / 1000;
    parameters[`engine.fm.op${op}-decay`] = Number(document.querySelector(`#fm-op${op}-decay`).value) / 1000;
    parameters[`engine.fm.op${op}-sustain`] = Number(document.querySelector(`#fm-op${op}-sustain`).value) / 100;
    parameters[`engine.fm.op${op}-release`] = Number(document.querySelector(`#fm-op${op}-release`).value) / 1000;
  }
  return parameters;
}

function syncFMControls(parameters = readFMParameters()) {
  document.querySelector('#fm-algorithm').value = String(parameters['engine.fm.algorithm']);
  document.querySelector('#fm-algorithm-value').textContent = String(parameters['engine.fm.algorithm']).padStart(2, '0');
  document.querySelector('#fm-feedback').value = String(Math.round(parameters['engine.fm.feedback'] * 100));
  document.querySelector('#fm-feedback-value').textContent = `${Math.round(parameters['engine.fm.feedback'] * 100)}%`;
  for (let op = 1; op <= 4; op++) {
    for (const [name, factor, unit, digits] of [
      ['ratio', 1, '×', 2], ['level', 100, '%', 0], ['index', 1, '', 1],
      ['attack', 1000, ' ms', 0], ['decay', 1000, ' ms', 0], ['sustain', 100, '%', 0], ['release', 1000, ' ms', 0],
    ]) {
      const input = document.querySelector(`#fm-op${op}-${name}`);
      const output = document.querySelector(`#fm-op${op}-${name}-value`);
      const value = parameters[`engine.fm.op${op}-${name}`];
      input.value = String(value * factor);
      output.value = `${Number(value).toFixed(digits)}${unit}`;
      output.textContent = output.value;
    }
  }
}

function readSynthParameters() {
  return {
    'global.master-level': Number(document.querySelector('#master-level').value) / 100,
    'engine.virtual-analog.osc-wave': readWaveform(),
    'engine.virtual-analog.osc-source': readOscillatorSource(),
    'engine.virtual-analog.wavetable-morph': readWavetableMorph(),
    'engine.virtual-analog.osc2-enabled': document.querySelector('#osc2-enabled').checked,
    'engine.virtual-analog.osc2-wave': document.querySelector('#osc2-wave').value,
    'engine.virtual-analog.osc2-level': Number(document.querySelector('#osc2-level').value) / 100,
    'engine.virtual-analog.osc2-octave': Number(document.querySelector('#osc2-octave').value),
    'engine.virtual-analog.osc2-semitone': Number(document.querySelector('#osc2-semitone').value),
    'engine.virtual-analog.osc2-fine': Number(document.querySelector('#osc2-fine').value),
    'engine.virtual-analog.noise-enabled': document.querySelector('#noise-enabled').checked,
    'engine.virtual-analog.noise-color': document.querySelector('#noise-color').value,
    'engine.virtual-analog.noise-level': Number(document.querySelector('#noise-level').value) / 100,
    'engine.virtual-analog.sub-enabled': document.querySelector('#sub-enabled').checked,
    'engine.virtual-analog.sub-wave': document.querySelector('#sub-wave').value,
    'engine.virtual-analog.sub-level': Number(document.querySelector('#sub-level').value) / 100,
    'engine.virtual-analog.sub-octave': Number(document.querySelector('#sub-octave').value),
    'engine.virtual-analog.eg-sub-pitch-amount': Number(document.querySelector('#eg-sub-pitch-amount').value),
    'engine.virtual-analog.eg-sub-pitch-enabled': document.querySelector('#eg-sub-pitch-enabled').checked,
    'engine.virtual-analog.pitch-env-sub-pitch-amount': Number(document.querySelector('#pitch-env-sub-pitch-amount').value),
    'engine.virtual-analog.pitch-env-sub-pitch-enabled': document.querySelector('#pitch-env-sub-pitch-enabled').checked,
    'engine.virtual-analog.lfo-sub-pitch-amount': Number(document.querySelector('#lfo-sub-pitch-amount').value),
    'engine.virtual-analog.lfo-sub-pitch-enabled': document.querySelector('#lfo-sub-pitch-enabled').checked,
    'engine.virtual-analog.unison-voices': Number(document.querySelector('#unison-voices').value),
    'engine.virtual-analog.unison-detune': Number(document.querySelector('#unison-detune').value),
    'engine.virtual-analog.unison-spread': Number(document.querySelector('#unison-spread').value),
    'engine.virtual-analog.amp-attack': Number(document.querySelector('#attack').value) / 1000,
    'engine.virtual-analog.amp-decay': Number(document.querySelector('#decay').value) / 1000,
    'engine.virtual-analog.amp-sustain': Number(document.querySelector('#sustain').value) / 100,
    'engine.virtual-analog.amp-release': Number(document.querySelector('#release').value) / 1000,
    'engine.virtual-analog.filter-mode': document.querySelector('#filter-mode').value,
    'engine.virtual-analog.filter-cutoff': Math.round(20 * (1000 ** (Number(document.querySelector('#filter-cutoff').value) / 1000))),
    'engine.virtual-analog.filter-resonance': Number(document.querySelector('#filter-resonance').value) / 100,
    'engine.virtual-analog.filter-env-attack': Number(document.querySelector('#filter-env-attack').value) / 1000,
    'engine.virtual-analog.filter-env-decay': Number(document.querySelector('#filter-env-decay').value) / 1000,
    'engine.virtual-analog.filter-env-sustain': Number(document.querySelector('#filter-env-sustain').value) / 100,
    'engine.virtual-analog.filter-env-release': Number(document.querySelector('#filter-env-release').value) / 1000,
    'engine.virtual-analog.filter-env-amount': Number(document.querySelector('#filter-env-amount').value),
    'engine.virtual-analog.lfo1-rate': Number(document.querySelector('#lfo1-rate').value) / 100,
    'engine.virtual-analog.lfo1-waveform': document.querySelector('#lfo1-waveform').value,
    'engine.virtual-analog.lfo1-amount': Number(document.querySelector('#lfo1-amount').value),
    'engine.virtual-analog.filter-env-route-enabled': document.querySelector('#filter-env-route-enabled').checked,
    'engine.virtual-analog.pitch-env-attack': Number(document.querySelector('#pitch-env-attack').value) / 1000,
    'engine.virtual-analog.pitch-env-decay': Number(document.querySelector('#pitch-env-decay').value) / 1000,
    'engine.virtual-analog.pitch-env-sustain': Number(document.querySelector('#pitch-env-sustain').value) / 100,
    'engine.virtual-analog.pitch-env-release': Number(document.querySelector('#pitch-env-release').value) / 1000,
    'engine.virtual-analog.pitch-env-osc1-amount': Number(document.querySelector('#pitch-env-osc1-amount').value),
    'engine.virtual-analog.pitch-env-osc1-enabled': document.querySelector('#pitch-env-osc1-enabled').checked,
    'engine.virtual-analog.pitch-env-osc2-amount': Number(document.querySelector('#pitch-env-osc2-amount').value),
    'engine.virtual-analog.pitch-env-osc2-enabled': document.querySelector('#pitch-env-osc2-enabled').checked,
    'engine.virtual-analog.eg-osc1-pitch-amount': Number(document.querySelector('#eg-osc1-amount').value),
    'engine.virtual-analog.eg-osc1-pitch-enabled': document.querySelector('#eg-osc1-enabled').checked,
    'engine.virtual-analog.eg-osc2-pitch-amount': Number(document.querySelector('#eg-osc2-amount').value),
    'engine.virtual-analog.eg-osc2-pitch-enabled': document.querySelector('#eg-osc2-enabled').checked,
    'engine.virtual-analog.lfo-osc1-pitch-amount': Number(document.querySelector('#lfo-osc1-amount').value),
    'engine.virtual-analog.lfo-osc1-pitch-enabled': document.querySelector('#lfo-osc1-enabled').checked,
    'engine.virtual-analog.lfo-osc2-pitch-amount': Number(document.querySelector('#lfo-osc2-amount').value),
    'engine.virtual-analog.lfo-osc2-pitch-enabled': document.querySelector('#lfo-osc2-enabled').checked,
    'engine.virtual-analog.lfo1-route-enabled': document.querySelector('#lfo1-route-enabled').checked,
  };
}

function applySynthParameters() {
  try {
    if (readOscillatorSource() === 'fm') engine.setFMParameters(readFMParameters());
    else engine.setParameters(readSynthParameters());
  } catch (error) {
    message.textContent = `Parâmetros rejeitados: ${error.message}`;
  }
}

function updateWavetableMorphReadout() {
  const value = document.querySelector('#wavetable-morph').value;
  const output = document.querySelector('#wavetable-morph-value');
  output.value = `${value}%`;
  output.textContent = output.value;
}

function updateOscillatorSourceUI() {
  const source = readOscillatorSource();
  const wavetable = source === 'wavetable';
  const fm = source === 'fm';
  document.querySelector('#analog-wave-picks').hidden = wavetable || fm;
  document.querySelector('#wavetable-controls').hidden = !wavetable;
  document.querySelector('#fm-controls').hidden = !fm;
  document.querySelector('#osc1-source-state').textContent = fm ? 'FOUR-OP FM' : wavetable ? 'WAVETABLE' : 'VIRTUAL ANALOG';
  document.querySelector('#osc1-engine-readout').textContent = fm ? 'FM / PHASE MODULATION' : wavetable ? 'WAVETABLE' : 'VIRTUAL ANALOG';
  document.querySelector('#osc1-alias-readout').textContent = fm ? 'SINE OPERATOR BANK' : wavetable ? 'BAND-LIMITED MIPS' : 'POLYBLEP';
  updateWaveformScope(readWaveform());
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

  if (readOscillatorSource() === 'wavetable') {
    const frames = createDefaultWavetableDefinition(readWavetableMorph()).partialFrames;
    const position = readWavetableMorph() * (frames.length - 1);
    const frameIndex = Math.min(frames.length - 1, Math.floor(position));
    const nextIndex = Math.min(frames.length - 1, frameIndex + 1);
    const mix = position - frameIndex;
    const sample = (phase, frame) => frame.reduce((sum, partial) => sum + partial.amplitude * Math.sin(2 * Math.PI * partial.harmonic * phase), 0);
    const values = Array.from({ length: 129 }, (_, index) => {
      const phase = index / 128;
      return sample(phase, frames[frameIndex]) * (1 - mix) + sample(phase, frames[nextIndex]) * mix;
    });
    const peak = Math.max(0.001, ...values.map(Math.abs));
    const points = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index / 128 * 640).toFixed(1)} ${(90 - value / peak * 70).toFixed(1)}`);
    path.setAttribute('d', points.join(' '));
    return;
  }

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

function updateFilterEnvelopeGraph() {
  const attack = Number(document.querySelector('#filter-env-attack').value);
  const decay = Number(document.querySelector('#filter-env-decay').value);
  const sustain = Number(document.querySelector('#filter-env-sustain').value) / 100;
  const release = Number(document.querySelector('#filter-env-release').value);
  const amount = Number(document.querySelector('#filter-env-amount').value);
  const routeEnabled = document.querySelector('#filter-env-route-enabled').checked;
  const attackX = 28 + (attack / 3000) * 110;
  const decayX = attackX + 42 + (decay / 3000) * 120;
  const sustainY = 180 - (sustain * 145);
  const releaseStartX = Math.min(490, Math.max(410, decayX + 100));
  const releaseEndX = 585 - (release / 3000) * 36;
  const path = `M0 180 L${attackX} 18 L${decayX} ${sustainY} L${releaseStartX} ${sustainY} L${releaseEndX} 180`;
  document.querySelector('#filter-env-path').setAttribute('d', path);
  document.querySelector('#filter-env-fill').setAttribute('d', `${path} Z`);
  const depth = document.querySelector('#filter-env-depth-readout');
  depth.textContent = `${amount > 0 ? '+' : ''}${amount} semitons`;
  document.querySelector('#filter-env-polarity').textContent = !routeEnabled
    ? 'ROUTE DISABLED'
    : amount > 0 ? 'POSITIVE · OPEN' : amount < 0 ? 'NEGATIVE · CLOSE' : 'NEUTRAL';
}

function updatePitchEnvelopeGraph() {
  const attack = Number(document.querySelector('#pitch-env-attack').value);
  const decay = Number(document.querySelector('#pitch-env-decay').value);
  const sustain = Number(document.querySelector('#pitch-env-sustain').value) / 100;
  const release = Number(document.querySelector('#pitch-env-release').value);
  const attackX = 28 + (attack / 3000) * 110;
  const decayX = attackX + 42 + (decay / 3000) * 120;
  const sustainY = 180 - (sustain * 145);
  const releaseStartX = Math.min(490, Math.max(410, decayX + 100));
  const releaseEndX = 585 - (release / 3000) * 36;
  const path = `M0 180 L${attackX} 18 L${decayX} ${sustainY} L${releaseStartX} ${sustainY} L${releaseEndX} 180`;
  document.querySelector('#pitch-env-path').setAttribute('d', path);
  document.querySelector('#pitch-env-fill').setAttribute('d', `${path} Z`);
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

    const record = { button, released: false, voiceId: null, wavetable: readOscillatorSource() === 'wavetable', fm: readOscillatorSource() === 'fm', initialMorph: readWavetableMorph() };
    activePointers.set(event.pointerId, record);
    syncHeldKeys();

    applySynthParameters();
    engine.setEngine(record.fm ? 'fm' : 'virtual-analog');
    engine.noteOn({
      note,
      frequency: frequencyForMidi(note),
      velocity: 0.85,
      ...(record.wavetable ? { wavetable: createDefaultWavetableDefinition(record.initialMorph) } : {}),
    }).then(async (voiceId) => {
      record.voiceId = voiceId;
      if (record.wavetable && readWavetableMorph() !== record.initialMorph) engine.setWavetableMorph(voiceId, readWavetableMorph());
      observeAudioContext(engine.context);

      if (record.released) {
        await engine.noteOff(voiceId);
        if (activePointers.get(event.pointerId) === record) {
          activePointers.delete(event.pointerId);
        }
      } else {
        message.textContent = `Nota MIDI ${note} ativa · ${record.fm ? 'FM / 4 OP' : record.wavetable ? 'WAVETABLE' : readWaveform().toUpperCase()}`;
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

// Signal-stage navigation changes the visible module without changing the DSP contract.
document.querySelectorAll('[data-tab]').forEach((stage) => {
  stage.addEventListener('click', () => {
    const target = stage.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((item) => {
      if (item === stage) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-view]').forEach((view) => {
      view.hidden = view.dataset.view !== target;
    });
  });
});

// Fullscreen is scoped to the instrument shell. Browsers without the Fullscreen API
// receive a reversible immersive fallback without claiming the browser chrome is hidden.
const fullscreenRoot = document.querySelector('.app-shell');
const fullscreenToggle = document.querySelector('#fullscreen-toggle');
const isNativeFullscreen = () => document.fullscreenElement === fullscreenRoot
  || document.webkitFullscreenElement === fullscreenRoot;
const isImmersive = () => isNativeFullscreen() || fullscreenRoot.classList.contains('app-focus-mode');

function syncFullscreenControl() {
  const active = isImmersive();
  fullscreenToggle.setAttribute('aria-pressed', String(active));
  fullscreenToggle.setAttribute('aria-label', active ? 'Sair da tela cheia' : 'Ativar tela cheia');
  fullscreenToggle.title = active ? 'Sair da tela cheia' : 'Ativar tela cheia';
  fullscreenToggle.querySelector('.fullscreen-label').textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  fullscreenToggle.querySelector('.fullscreen-glyph').textContent = active ? '⛶' : '⛶';
}

fullscreenToggle.addEventListener('click', async () => {
  if (isNativeFullscreen()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      try { await exit.call(document); } catch { fullscreenRoot.classList.remove('app-focus-mode'); }
    }
  } else if (fullscreenRoot.classList.contains('app-focus-mode')) {
    fullscreenRoot.classList.remove('app-focus-mode');
  } else {
    const request = fullscreenRoot.requestFullscreen || fullscreenRoot.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(fullscreenRoot, { navigationUI: 'hide' });
      } catch {
        fullscreenRoot.classList.add('app-focus-mode');
        message.textContent = 'Tela cheia do navegador indisponível; modo imersivo ativado.';
      }
    } else {
      fullscreenRoot.classList.add('app-focus-mode');
      message.textContent = 'Este navegador não oferece tela cheia nativa; modo imersivo ativado.';
    }
  }
  syncFullscreenControl();
});

document.addEventListener('fullscreenchange', syncFullscreenControl);
document.addEventListener('webkitfullscreenchange', syncFullscreenControl);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && fullscreenRoot.classList.contains('app-focus-mode')) {
    fullscreenRoot.classList.remove('app-focus-mode');
    syncFullscreenControl();
  }
});
syncFullscreenControl();

document.querySelectorAll('[data-wave]').forEach((button) => {
  button.addEventListener('click', () => setWaveform(button.dataset.wave));
});

const osc1Source = document.querySelector('#osc1-source');
const wavetableMorph = document.querySelector('#wavetable-morph');
osc1Source.addEventListener('change', () => {
  for (const pointerId of [...activePointers.keys()]) releasePointer(pointerId);
  updateOscillatorSourceUI();
  engine.setEngine(readOscillatorSource() === 'fm' ? 'fm' : 'virtual-analog');
  applySynthParameters();
});
wavetableMorph.addEventListener('input', () => {
  updateWavetableMorphReadout();
  updateWaveformScope(readWaveform());
  applySynthParameters();
  const morph = readWavetableMorph();
  for (const record of activePointers.values()) {
    if (record.wavetable && record.voiceId && !record.released) engine.setWavetableMorph(record.voiceId, morph);
  }
});

const fmAlgorithm = document.querySelector('#fm-algorithm');
const fmFeedback = document.querySelector('#fm-feedback');
fmAlgorithm.addEventListener('change', () => {
  document.querySelector('#fm-algorithm-value').textContent = String(fmAlgorithm.value).padStart(2, '0');
  applySynthParameters();
});
fmFeedback.addEventListener('input', () => {
  document.querySelector('#fm-feedback-value').textContent = `${fmFeedback.value}%`;
  applySynthParameters();
});
for (let op = 1; op <= 4; op++) {
  for (const name of ['ratio', 'level', 'index', 'attack', 'decay', 'sustain', 'release']) {
    const input = document.querySelector(`#fm-op${op}-${name}`);
    const output = document.querySelector(`#fm-op${op}-${name}-value`);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      const unit = name === 'ratio' ? '×' : name === 'level' || name === 'sustain' ? '%' : name === 'attack' || name === 'decay' || name === 'release' ? ' ms' : '';
      const shown = name === 'ratio' || name === 'index' ? value.toFixed(2) : Math.round(value);
      output.value = `${shown}${unit}`;
      output.textContent = output.value;
      applySynthParameters();
    });
  }
}
syncFMControls();

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

const delayControls = {
  time: document.querySelector('#delay-time'),
  feedback: document.querySelector('#delay-feedback'),
  mix: document.querySelector('#delay-mix'),
  pingPong: document.querySelector('#delay-ping-pong'),
};
const delayOutputs = {
  time: document.querySelector('#delay-time-value'),
  feedback: document.querySelector('#delay-feedback-value'),
  mix: document.querySelector('#delay-mix-value'),
};
const reverbControls = {
  roomSize: document.querySelector('#reverb-room'),
  damping: document.querySelector('#reverb-damping'),
  reverbMix: document.querySelector('#reverb-mix'),
  width: document.querySelector('#reverb-width'),
  preDelayMs: document.querySelector('#reverb-predelay'),
  earlyLevel: document.querySelector('#reverb-early'),
  modulationRateHz: document.querySelector('#reverb-mod-rate'),
  modulationDepthMs: document.querySelector('#reverb-mod-depth'),
};
const fxRackMode = document.querySelector('#fx-rack-mode');
const fxRackModeValue = document.querySelector('#fx-rack-mode-value');
const fxRackOrder = document.querySelector('#fx-rack-order');
const fxRackOrderValue = document.querySelector('#fx-rack-order-value');
const fxRackOrderHint = fxRackOrder.closest('.control').querySelector('.control-hint');
const delayMixHint = delayControls.mix.closest('.control').querySelector('.control-hint');
const reverbMixHint = reverbControls.reverbMix.closest('.control').querySelector('.control-hint');
const fxRackDelayEnabled = document.querySelector('#fx-rack-delay-enabled');
const fxRackReverbEnabled = document.querySelector('#fx-rack-reverb-enabled');
const fxRackControls = Object.fromEntries(['delay-send', 'delay-return', 'reverb-send', 'reverb-return', 'dry-level', 'wet-level'].map((key) => [key, document.querySelector(`#fx-rack-${key}`)]));
const fxRackOutputs = Object.fromEntries(Object.keys(fxRackControls).map((key) => [key, document.querySelector(`#fx-rack-${key}-value`)]));
function applyEffectRackConfiguration() {
  const order = fxRackOrder.value.split(',');
  const percent = (key) => Number(fxRackControls[key].value) / 100;
  const configuration = {
    mode: fxRackMode.value,
    order,
    enabled: { delay: fxRackDelayEnabled.checked, reverb: fxRackReverbEnabled.checked },
    levels: {
      delay: { send: percent('delay-send'), return: percent('delay-return') },
      reverb: { send: percent('reverb-send'), return: percent('reverb-return') },
    },
    dryLevel: percent('dry-level'),
    wetLevel: percent('wet-level'),
  };
  fxRackModeValue.textContent = fxRackMode.value.toUpperCase();
  fxRackOrderValue.textContent = order.map((name) => name.toUpperCase()).join(' → ');
  const parallel = fxRackMode.value === 'parallel';
  fxRackOrder.disabled = parallel;
  fxRackOrderHint.textContent = parallel ? 'No modo paralelo, cada efeito recebe o sinal dry original; a ordem não altera o fluxo.' : 'A ordem altera como os módulos alimentam um ao outro.';
  for (const control of Object.values(fxRackControls)) control.disabled = !parallel;
  delayControls.mix.disabled = parallel;
  reverbControls.reverbMix.disabled = parallel;
  delayMixHint.textContent = parallel ? 'Em paralelo, use DELAY RETURN no FX Rack.' : 'Mistura linear entre sinal direto e ecos.';
  reverbMixHint.textContent = parallel ? 'Em paralelo, use REVERB RETURN no FX Rack.' : 'Mistura independente do delay.';
  for (const [key, control] of Object.entries(fxRackControls)) fxRackOutputs[key].textContent = `${control.value}%`;
  try { engine.setEffectRackConfiguration(configuration); }
  catch (error) { message.textContent = `FX Rack rejeitado: ${error.message}`; }
}
fxRackMode.addEventListener('change', applyEffectRackConfiguration);
fxRackOrder.addEventListener('change', applyEffectRackConfiguration);
fxRackDelayEnabled.addEventListener('change', applyEffectRackConfiguration);
fxRackReverbEnabled.addEventListener('change', applyEffectRackConfiguration);
for (const control of Object.values(fxRackControls)) control.addEventListener('input', applyEffectRackConfiguration);

const reverbOutputs = {
  roomSize: document.querySelector('#reverb-room-value'),
  damping: document.querySelector('#reverb-damping-value'),
  reverbMix: document.querySelector('#reverb-mix-value'),
  width: document.querySelector('#reverb-width-value'),
  preDelayMs: document.querySelector('#reverb-predelay-value'),
  earlyLevel: document.querySelector('#reverb-early-value'),
  modulationRateHz: document.querySelector('#reverb-mod-rate-value'),
  modulationDepthMs: document.querySelector('#reverb-mod-depth-value'),
};
function syncDelayControls(parameters) {
  delayControls.time.value = String(Math.round(parameters.time * 1000));
  delayControls.feedback.value = String(Math.round(parameters.feedback * 100));
  delayControls.mix.value = String(Math.round(parameters.mix * 100));
  delayControls.pingPong.checked = parameters.pingPong;
  reverbControls.roomSize.value = String(Math.round(parameters.roomSize * 100));
  reverbControls.damping.value = String(Math.round(parameters.damping * 100));
  reverbControls.reverbMix.value = String(Math.round(parameters.reverbMix * 100));
  reverbControls.width.value = String(Math.round(parameters.width * 100));
  reverbControls.preDelayMs.value = String(parameters.preDelayMs);
  reverbControls.earlyLevel.value = String(Math.round(parameters.earlyLevel * 100));
  reverbControls.modulationRateHz.value = String(parameters.modulationRateHz);
  reverbControls.modulationDepthMs.value = String(parameters.modulationDepthMs);
  for (const [key, control] of Object.entries(reverbControls)) reverbOutputs[key].textContent = key === 'preDelayMs' ? `${control.value} ms` : key === 'modulationRateHz' ? `${Number(control.value).toFixed(2)} Hz` : key === 'modulationDepthMs' ? `${Number(control.value).toFixed(2)} ms` : `${control.value}%`;
  delayOutputs.time.textContent = `${delayControls.time.value} ms`;
  delayOutputs.feedback.textContent = `${delayControls.feedback.value}%`;
  delayOutputs.mix.textContent = `${delayControls.mix.value}%`;
  document.querySelector('#delay-mode-readout').textContent = parameters.pingPong ? 'PING-PONG' : 'STEREO';
  engine.setEffectParameters(parameters);
}
function applyDelayParameters() {
  const parameters = {
    time: Number(delayControls.time.value) / 1000,
    feedback: Number(delayControls.feedback.value) / 100,
    mix: Number(delayControls.mix.value) / 100,
    pingPong: delayControls.pingPong.checked,
    roomSize: Number(reverbControls.roomSize.value) / 100,
    damping: Number(reverbControls.damping.value) / 100,
    reverbMix: Number(reverbControls.reverbMix.value) / 100,
    width: Number(reverbControls.width.value) / 100,
    preDelayMs: Number(reverbControls.preDelayMs.value),
    earlyLevel: Number(reverbControls.earlyLevel.value) / 100,
    modulationRateHz: Number(reverbControls.modulationRateHz.value),
    modulationDepthMs: Number(reverbControls.modulationDepthMs.value),
  };
  try { engine.setEffectParameters(parameters); }
  catch (error) { message.textContent = `Delay rejeitado: ${error.message}`; }
}
for (const [key, control] of Object.entries(reverbControls)) {
  control.addEventListener('input', () => {
    reverbOutputs[key].textContent = key === 'preDelayMs' || key === 'modulationDepthMs' ? `${control.value} ms` : key === 'modulationRateHz' ? `${Number(control.value).toFixed(2)} Hz` : `${control.value}%`;
    applyDelayParameters();
  });
}

for (const [key, control] of Object.entries(delayControls)) {
  control.addEventListener(key === 'pingPong' ? 'change' : 'input', () => {
    if (key === 'time') delayOutputs.time.textContent = `${control.value} ms`;
    if (key === 'feedback') delayOutputs.feedback.textContent = `${control.value}%`;
    if (key === 'mix') delayOutputs.mix.textContent = `${control.value}%`;
    document.querySelector('#delay-mode-readout').textContent = delayControls.pingPong.checked ? 'PING-PONG' : 'STEREO';
    applyDelayParameters();
  });
}

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

for (const [id, unit] of [
  ['filter-env-attack', 'ms'],
  ['filter-env-decay', 'ms'],
  ['filter-env-sustain', '%'],
  ['filter-env-release', 'ms'],
  ['filter-env-amount', 'st'],
]) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-value`);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    output.value = id === 'filter-env-amount'
      ? `${value > 0 ? '+' : ''}${value} ${unit}`
      : `${value}${unit}`;
    output.textContent = output.value;
    updateFilterEnvelopeGraph();
    applySynthParameters();
  });
}
updateFilterEnvelopeGraph();

function updateLfoWaveformGraph(waveform = document.querySelector('#lfo1-waveform').value) {
  const paths = {
    sine: 'M0 90 C40 10 80 10 120 90 S200 170 240 90 S320 10 360 90 S440 170 480 90 S560 10 600 90 S640 130 640 90',
    triangle: 'M0 170 L80 10 L160 170 L240 10 L320 170 L400 10 L480 170 L560 10 L640 170',
    square: 'M0 150 H80 V30 H160 V150 H240 V30 H320 V150 H400 V30 H480 V150 H560 V30 H640',
    'saw-up': 'M0 150 L80 30 V150 L160 30 V150 L240 30 V150 L320 30 V150 L400 30 V150 L480 30 V150 L560 30 V150 L640 30',
    'saw-down': 'M0 30 L80 150 V30 L160 150 V30 L240 150 V30 L320 150 V30 L400 150 V30 L480 150 V30 L560 150 V30 L640 150',
  };
  document.querySelector('#lfo1-wave-path').setAttribute('d', paths[waveform] ?? paths.sine);
  const amount = Number(document.querySelector('#lfo1-amount').value);
  const enabled = document.querySelector('#lfo1-route-enabled').checked;
  document.querySelector('#lfo1-amount-readout').textContent = `${amount > 0 ? '+' : ''}${amount} st${enabled ? '' : ' · OFF'}`;
}

const osc2Enabled = document.querySelector('#osc2-enabled');
const osc2Wave = document.querySelector('#osc2-wave');
const osc2Level = document.querySelector('#osc2-level');
const osc2LevelOutput = document.querySelector('#osc2-level-value');
const osc2Octave = document.querySelector('#osc2-octave');
const osc2Semitone = document.querySelector('#osc2-semitone');
const osc2SemitoneOutput = document.querySelector('#osc2-semitone-value');
const osc2Fine = document.querySelector('#osc2-fine');
const osc2FineOutput = document.querySelector('#osc2-fine-value');
function updateOscillator2Readouts() {
  const octave = Number(osc2Octave.value);
  const semitone = Number(osc2Semitone.value);
  const fine = Number(osc2Fine.value);
  document.querySelector('#osc2-pitch-readout').textContent =
    `${octave > 0 ? '+' : ''}${octave} oct · ${semitone > 0 ? '+' : ''}${semitone} st · ${fine > 0 ? '+' : ''}${fine} ct`;
  document.querySelector('#osc2-level-readout').textContent = `${osc2Level.value}%`;
}
osc2Enabled.addEventListener('change', applySynthParameters);
osc2Wave.addEventListener('change', applySynthParameters);
osc2Level.addEventListener('input', () => {
  osc2LevelOutput.value = `${osc2Level.value}%`;
  osc2LevelOutput.textContent = osc2LevelOutput.value;
  updateOscillator2Readouts();
  applySynthParameters();
});
osc2Octave.addEventListener('change', () => { updateOscillator2Readouts(); applySynthParameters(); });
osc2Semitone.addEventListener('input', () => {
  osc2SemitoneOutput.value = `${osc2Semitone.value} st`;
  osc2SemitoneOutput.textContent = osc2SemitoneOutput.value;
  updateOscillator2Readouts();
  applySynthParameters();
});
osc2Fine.addEventListener('input', () => {
  osc2FineOutput.value = `${osc2Fine.value} cents`;
  osc2FineOutput.textContent = osc2FineOutput.value;
  updateOscillator2Readouts();
  applySynthParameters();
});
updateOscillator2Readouts();

const noiseEnabled = document.querySelector('#noise-enabled');
const noiseColor = document.querySelector('#noise-color');
const noiseLevel = document.querySelector('#noise-level');
const noiseLevelOutput = document.querySelector('#noise-level-value');
const unisonVoices = document.querySelector('#unison-voices');
const unisonDetune = document.querySelector('#unison-detune');
const unisonDetuneOutput = document.querySelector('#unison-detune-value');
const unisonSpread = document.querySelector('#unison-spread');
const unisonSpreadOutput = document.querySelector('#unison-spread-value');
noiseEnabled.addEventListener('change', applySynthParameters);
unisonVoices.addEventListener('change', applySynthParameters);
unisonSpread.addEventListener('input', () => {
  unisonSpreadOutput.value = `${unisonSpread.value}%`;
  unisonSpreadOutput.textContent = unisonSpreadOutput.value;
  applySynthParameters();
});
unisonDetune.addEventListener('input', () => {
  unisonDetuneOutput.value = `${Number(unisonDetune.value).toFixed(1)} cents`;
  unisonDetuneOutput.textContent = unisonDetuneOutput.value;
  applySynthParameters();
});
noiseColor.addEventListener('change', applySynthParameters);
noiseLevel.addEventListener('input', () => {
  noiseLevelOutput.value = `${noiseLevel.value}%`;
  noiseLevelOutput.textContent = noiseLevelOutput.value;
  applySynthParameters();
});

const subEnabled = document.querySelector('#sub-enabled');
const subWave = document.querySelector('#sub-wave');
const subLevel = document.querySelector('#sub-level');
const subLevelOutput = document.querySelector('#sub-level-value');
const subOctave = document.querySelector('#sub-octave');
subEnabled.addEventListener('change', applySynthParameters);
subWave.addEventListener('change', applySynthParameters);
subOctave.addEventListener('change', applySynthParameters);
subLevel.addEventListener('input', () => {
  subLevelOutput.value = `${subLevel.value}%`;
  subLevelOutput.textContent = subLevelOutput.value;
  applySynthParameters();
});

const lfoWaveform = document.querySelector('#lfo1-waveform');
const lfoRate = document.querySelector('#lfo1-rate');
const lfoRateOutput = document.querySelector('#lfo1-rate-value');
const lfoAmount = document.querySelector('#lfo1-amount');
const lfoAmountOutput = document.querySelector('#lfo1-amount-value');
const filterEnvRouteEnabled = document.querySelector('#filter-env-route-enabled');
const lfoRouteEnabled = document.querySelector('#lfo1-route-enabled');
for (const [id, unit] of [['pitch-env-attack', 'ms'], ['pitch-env-decay', 'ms'], ['pitch-env-sustain', '%'], ['pitch-env-release', 'ms']]) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-value`);
  input.addEventListener('input', () => {
    output.value = `${input.value}${unit}`;
    output.textContent = output.value;
    updatePitchEnvelopeGraph();
    applySynthParameters();
  });
}
updatePitchEnvelopeGraph();
filterEnvRouteEnabled.addEventListener('change', () => {
  updateFilterEnvelopeGraph();
  applySynthParameters();
});
lfoRouteEnabled.addEventListener('change', () => {
  updateLfoWaveformGraph();
  applySynthParameters();
});

for (const route of ['eg-osc1', 'lfo-osc1', 'eg-osc2', 'lfo-osc2', 'pitch-env-osc1', 'pitch-env-osc2', 'eg-sub-pitch', 'pitch-env-sub-pitch', 'lfo-sub-pitch']) {
  const enabled = document.querySelector(`#${route}-enabled`);
  const amount = document.querySelector(`#${route}-amount`);
  const output = document.querySelector(`#${route}-amount-value`);
  enabled.addEventListener('change', applySynthParameters);
  amount.addEventListener('input', () => {
    const value = Number(amount.value);
    output.value = `${value > 0 ? '+' : ''}${value} st`;
    output.textContent = output.value;
    applySynthParameters();
  });
}
lfoWaveform.addEventListener('change', () => {
  updateLfoWaveformGraph();
  applySynthParameters();
});
lfoRate.addEventListener('input', () => {
  lfoRateOutput.value = `${(Number(lfoRate.value) / 100).toFixed(2)} Hz`;
  lfoRateOutput.textContent = lfoRateOutput.value;
  applySynthParameters();
});
lfoAmount.addEventListener('input', () => {
  const amount = Number(lfoAmount.value);
  lfoAmountOutput.value = `${amount > 0 ? '+' : ''}${amount} st`;
  lfoAmountOutput.textContent = lfoAmountOutput.value;
  updateLfoWaveformGraph();
  applySynthParameters();
});
updateLfoWaveformGraph();

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
    const patch = readOscillatorSource() === 'fm'
      ? createFMEnginePatch(readFMParameters(), name, engine.getEffectParameters(), engine.getEffectRackConfiguration())
      : createVirtualAnalogPatch(engine.getParameters(), name, engine.getEffectParameters(), engine.getEffectRackConfiguration());
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
    const effectParameters = applyPatchEffectParameters(patch);
    syncDelayControls(effectParameters);
    const rackConfiguration = applyPatchEffectRackConfiguration(patch);
    fxRackMode.value = rackConfiguration.mode;
    fxRackOrder.value = rackConfiguration.order.join(',');
    fxRackDelayEnabled.checked = rackConfiguration.enabled.delay;
    fxRackReverbEnabled.checked = rackConfiguration.enabled.reverb;
    fxRackControls['delay-send'].value = String(Math.round(rackConfiguration.levels.delay.send * 100));
    fxRackControls['delay-return'].value = String(Math.round(rackConfiguration.levels.delay.return * 100));
    fxRackControls['reverb-send'].value = String(Math.round(rackConfiguration.levels.reverb.send * 100));
    fxRackControls['reverb-return'].value = String(Math.round(rackConfiguration.levels.reverb.return * 100));
    fxRackControls['dry-level'].value = String(Math.round(rackConfiguration.dryLevel * 100));
    fxRackControls['wet-level'].value = String(Math.round(rackConfiguration.wetLevel * 100));
    applyEffectRackConfiguration();
    if (patch.engineSlots[0]?.engineId === 'fm') {
      const fmParameters = applyFMEnginePatch(patch);
      osc1Source.value = 'fm';
      masterLevel.value = String(Math.round(fmParameters['global.master-level'] * 100));
      masterLevelOutput.value = `${masterLevel.value}%`;
      masterLevelOutput.textContent = masterLevelOutput.value;
      syncFMControls(fmParameters);
      updateOscillatorSourceUI();
      engine.setEngine('fm');
      engine.setFMParameters(fmParameters);
      patchNameInput.value = patch.name;
      patchTitle.textContent = patch.name;
      message.textContent = `Patch FM \"${patch.name}\" carregado com quatro operadores.`;
      return;
    }
    const parameters = applyVirtualAnalogPatch(patch);
    masterLevel.value = String(Math.round(parameters['global.master-level'] * 100));
    masterLevelOutput.value = `${masterLevel.value}%`;
    masterLevelOutput.textContent = `${masterLevel.value}%`;
    document.querySelector('#attack').value = String(Math.round(parameters['engine.virtual-analog.amp-attack'] * 1000));
    document.querySelector('#decay').value = String(Math.round(parameters['engine.virtual-analog.amp-decay'] * 1000));
    document.querySelector('#sustain').value = String(Math.round(parameters['engine.virtual-analog.amp-sustain'] * 100));
    document.querySelector('#release').value = String(Math.round(parameters['engine.virtual-analog.amp-release'] * 1000));
    osc2Enabled.checked = parameters['engine.virtual-analog.osc2-enabled'];
    osc2Wave.value = parameters['engine.virtual-analog.osc2-wave'];
    osc2Level.value = String(Math.round(parameters['engine.virtual-analog.osc2-level'] * 100));
    osc2LevelOutput.value = `${osc2Level.value}%`;
    osc2LevelOutput.textContent = osc2LevelOutput.value;
    osc2Octave.value = String(parameters['engine.virtual-analog.osc2-octave']);
    osc2Semitone.value = String(parameters['engine.virtual-analog.osc2-semitone']);
    osc2SemitoneOutput.value = `${osc2Semitone.value} st`;
    osc2SemitoneOutput.textContent = osc2SemitoneOutput.value;
    osc2Fine.value = String(parameters['engine.virtual-analog.osc2-fine']);
    osc2FineOutput.value = `${osc2Fine.value} cents`;
    osc2FineOutput.textContent = osc2FineOutput.value;
    updateOscillator2Readouts();
    noiseEnabled.checked = parameters['engine.virtual-analog.noise-enabled'];
    noiseColor.value = parameters['engine.virtual-analog.noise-color'];
    noiseLevel.value = String(Math.round(parameters['engine.virtual-analog.noise-level'] * 100));
    noiseLevelOutput.value = `${noiseLevel.value}%`;
    noiseLevelOutput.textContent = noiseLevelOutput.value;
    subEnabled.checked = parameters['engine.virtual-analog.sub-enabled'];
    subWave.value = parameters['engine.virtual-analog.sub-wave'];
    subLevel.value = String(Math.round(parameters['engine.virtual-analog.sub-level'] * 100));
    subLevelOutput.value = `${subLevel.value}%`;
    subLevelOutput.textContent = subLevelOutput.value;
    subOctave.value = String(parameters['engine.virtual-analog.sub-octave']);
    unisonVoices.value = String(parameters['engine.virtual-analog.unison-voices']);
    unisonDetune.value = String(parameters['engine.virtual-analog.unison-detune']);
    unisonDetuneOutput.value = `${Number(unisonDetune.value).toFixed(1)} cents`;
    unisonDetuneOutput.textContent = unisonDetuneOutput.value;
    unisonSpread.value = String(parameters['engine.virtual-analog.unison-spread']);
    unisonSpreadOutput.value = `${unisonSpread.value}%`;
    unisonSpreadOutput.textContent = unisonSpreadOutput.value;
    filterEnvRouteEnabled.checked = parameters['engine.virtual-analog.filter-env-route-enabled'];
    for (const [id, factor, unit] of [
      ['pitch-env-attack', 1000, 'ms'],
      ['pitch-env-decay', 1000, 'ms'],
      ['pitch-env-sustain', 100, '%'],
      ['pitch-env-release', 1000, 'ms'],
    ]) {
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      input.value = String(Math.round(parameters[`engine.virtual-analog.${id}`] * factor));
      output.value = `${input.value}${unit}`;
      output.textContent = output.value;
    }
    updatePitchEnvelopeGraph();
    document.querySelector('#eg-osc1-enabled').checked = parameters['engine.virtual-analog.eg-osc1-pitch-enabled'];
    document.querySelector('#eg-osc1-amount').value = String(parameters['engine.virtual-analog.eg-osc1-pitch-amount']);
    document.querySelector('#eg-osc1-amount-value').value = `${parameters['engine.virtual-analog.eg-osc1-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.eg-osc1-pitch-amount']} st`;
    document.querySelector('#eg-osc1-amount-value').textContent = document.querySelector('#eg-osc1-amount-value').value;
    document.querySelector('#eg-osc2-enabled').checked = parameters['engine.virtual-analog.eg-osc2-pitch-enabled'];
    document.querySelector('#eg-osc2-amount').value = String(parameters['engine.virtual-analog.eg-osc2-pitch-amount']);
    document.querySelector('#eg-osc2-amount-value').value = `${parameters['engine.virtual-analog.eg-osc2-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.eg-osc2-pitch-amount']} st`;
    document.querySelector('#eg-osc2-amount-value').textContent = document.querySelector('#eg-osc2-amount-value').value;
    document.querySelector('#lfo-osc1-enabled').checked = parameters['engine.virtual-analog.lfo-osc1-pitch-enabled'];
    document.querySelector('#lfo-osc1-amount').value = String(parameters['engine.virtual-analog.lfo-osc1-pitch-amount']);
    document.querySelector('#lfo-osc1-amount-value').value = `${parameters['engine.virtual-analog.lfo-osc1-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.lfo-osc1-pitch-amount']} st`;
    document.querySelector('#lfo-osc1-amount-value').textContent = document.querySelector('#lfo-osc1-amount-value').value;
    document.querySelector('#lfo-osc2-enabled').checked = parameters['engine.virtual-analog.lfo-osc2-pitch-enabled'];
    document.querySelector('#lfo-osc2-amount').value = String(parameters['engine.virtual-analog.lfo-osc2-pitch-amount']);
    document.querySelector('#lfo-osc2-amount-value').value = `${parameters['engine.virtual-analog.lfo-osc2-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.lfo-osc2-pitch-amount']} st`;
    document.querySelector('#lfo-osc2-amount-value').textContent = document.querySelector('#lfo-osc2-amount-value').value;
    for (const [id, amountKey, enabledKey] of [
      ['pitch-env-osc1', 'engine.virtual-analog.pitch-env-osc1-amount', 'engine.virtual-analog.pitch-env-osc1-enabled'],
      ['pitch-env-osc2', 'engine.virtual-analog.pitch-env-osc2-amount', 'engine.virtual-analog.pitch-env-osc2-enabled'],
    ]) {
      const amount = document.querySelector(`#${id}-amount`);
      const output = document.querySelector(`#${id}-amount-value`);
      const value = parameters[amountKey];
      amount.value = String(value);
      output.value = `${value > 0 ? '+' : ''}${value} st`;
      output.textContent = output.value;
      document.querySelector(`#${id}-enabled`).checked = parameters[enabledKey];
    }
    for (const [id, amountKey, enabledKey] of [
      ['eg-sub-pitch', 'engine.virtual-analog.eg-sub-pitch-amount', 'engine.virtual-analog.eg-sub-pitch-enabled'],
      ['pitch-env-sub-pitch', 'engine.virtual-analog.pitch-env-sub-pitch-amount', 'engine.virtual-analog.pitch-env-sub-pitch-enabled'],
      ['lfo-sub-pitch', 'engine.virtual-analog.lfo-sub-pitch-amount', 'engine.virtual-analog.lfo-sub-pitch-enabled'],
    ]) {
      const amount = document.querySelector(`#${id}-amount`);
      const output = document.querySelector(`#${id}-amount-value`);
      const value = parameters[amountKey];
      amount.value = String(value);
      output.value = `${value > 0 ? '+' : ''}${value} st`;
      output.textContent = output.value;
      document.querySelector(`#${id}-enabled`).checked = parameters[enabledKey];
    }
    lfoRouteEnabled.checked = parameters['engine.virtual-analog.lfo1-route-enabled'];
    filterMode.value = parameters['engine.virtual-analog.filter-mode'];
    filterCutoff.value = String(Math.round(Math.log(parameters['engine.virtual-analog.filter-cutoff'] / 20) / Math.log(1000) * 1000));
    filterCutoffOutput.value = parameters['engine.virtual-analog.filter-cutoff'] >= 1000 ? `${(parameters['engine.virtual-analog.filter-cutoff'] / 1000).toFixed(2)} kHz` : `${Math.round(parameters['engine.virtual-analog.filter-cutoff'])} Hz`;
    filterCutoffOutput.textContent = filterCutoffOutput.value;
    filterResonance.value = String(Math.round(parameters['engine.virtual-analog.filter-resonance'] * 100));
    filterResonanceOutput.value = `${parameters['engine.virtual-analog.filter-resonance'].toFixed(2)} Q`;
    filterResonanceOutput.textContent = filterResonanceOutput.value;
    for (const [id, unit] of [
      ['filter-env-attack', 'ms'],
      ['filter-env-decay', 'ms'],
      ['filter-env-sustain', '%'],
      ['filter-env-release', 'ms'],
      ['filter-env-amount', 'st'],
    ]) {
      const value = parameters[`engine.virtual-analog.${id.replace('filter-env-', 'filter-env-')}`];
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      input.value = String(id === 'filter-env-amount' ? value : Math.round(value * (unit === '%' ? 100 : 1000)));
      output.value = id === 'filter-env-amount'
        ? `${value > 0 ? '+' : ''}${value} ${unit}`
        : `${input.value}${unit}`;
      output.textContent = output.value;
    }
    updateFilterEnvelopeGraph();
    lfoWaveform.value = parameters['engine.virtual-analog.lfo1-waveform'];
    lfoRate.value = String(Math.round(parameters['engine.virtual-analog.lfo1-rate'] * 100));
    lfoRateOutput.value = `${parameters['engine.virtual-analog.lfo1-rate'].toFixed(2)} Hz`;
    lfoRateOutput.textContent = lfoRateOutput.value;
    lfoAmount.value = String(parameters['engine.virtual-analog.lfo1-amount']);
    lfoAmountOutput.value = `${parameters['engine.virtual-analog.lfo1-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.lfo1-amount']} st`;
    lfoAmountOutput.textContent = lfoAmountOutput.value;
    updateLfoWaveformGraph();
    for (const [id, unit] of [['attack', 'ms'], ['decay', 'ms'], ['sustain', '%'], ['release', 'ms']]) {
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      output.value = `${input.value}${unit}`;
      output.textContent = `${input.value}${unit}`;
    }
    updateEnvelopeGraph();
    osc1Source.value = parameters['engine.virtual-analog.osc-source'];
    updateOscillatorSourceUI();
    engine.setEngine('virtual-analog');
    wavetableMorph.value = String(Math.round(parameters['engine.virtual-analog.wavetable-morph'] * 100));
    updateWavetableMorphReadout();
    updateOscillatorSourceUI();
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
updateWavetableMorphReadout();
updateOscillatorSourceUI();
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
