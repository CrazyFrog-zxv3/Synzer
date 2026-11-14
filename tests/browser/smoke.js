import { SynzerEngine } from '../../packages/dsp-engine/src/core/SynzerEngine.js';

const button = document.querySelector('#run');
const status = document.querySelector('#status');
const details = document.querySelector('#details');

button.addEventListener('click', async () => {
  button.disabled = true;
  let engine;
  try {
    const workletErrors = [];
    engine = new SynzerEngine({ maxVoices: 12, onError: (error) => workletErrors.push(error) });
    engine.workletUrl = new URL('./missing-synzer-processor.js', import.meta.url);
    let initialLoadRejected = false;
    try { await engine.initialize(); } catch { initialLoadRejected = true; }
    if (!initialLoadRejected || engine.node) throw new Error('Falha de carregamento do Worklet não foi isolada corretamente.');
    engine.workletUrl = new URL('../../packages/dsp-engine/src/worklets/synzer-processor.js', import.meta.url);
    await engine.initialize();
    const firstContext = engine.context;
    if (firstContext.state !== 'running') throw new Error(`AudioContext não está running: ${firstContext.state}`);

    const splitter = firstContext.createChannelSplitter(2);
    const leftAnalyser = firstContext.createAnalyser();
    const rightAnalyser = firstContext.createAnalyser();
    leftAnalyser.fftSize = 4096;
    rightAnalyser.fftSize = 4096;
    engine.node.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);

    engine.setParameters({
      'global.master-level': 0.4,
      'engine.virtual-analog.osc-wave': 'sine',
      'engine.virtual-analog.amp-attack': 0,
      'engine.virtual-analog.amp-decay': 0,
      'engine.virtual-analog.amp-sustain': 1,
      'engine.virtual-analog.amp-release': 0.08,
      'engine.virtual-analog.osc2-enabled': true,
      'engine.virtual-analog.osc2-wave': 'square',
      'engine.virtual-analog.osc2-level': 0.5,
      'engine.virtual-analog.osc2-octave': -1,
      'engine.virtual-analog.noise-enabled': true,
      'engine.virtual-analog.noise-color': 'pink',
      'engine.virtual-analog.noise-level': 0.2,
      'engine.virtual-analog.sub-enabled': true,
      'engine.virtual-analog.sub-wave': 'square',
      'engine.virtual-analog.sub-level': 0.25,
      'engine.virtual-analog.sub-octave': -1,
      'engine.virtual-analog.eg-sub-pitch-amount': 2,
      'engine.virtual-analog.eg-sub-pitch-enabled': true,
      'engine.virtual-analog.pitch-env-sub-pitch-amount': -3,
      'engine.virtual-analog.pitch-env-sub-pitch-enabled': true,
      'engine.virtual-analog.lfo-sub-pitch-amount': 4,
      'engine.virtual-analog.lfo-sub-pitch-enabled': true,
      'engine.virtual-analog.unison-voices': 3,
      'engine.virtual-analog.unison-detune': 8,
      'engine.virtual-analog.unison-spread': 65,
      'engine.virtual-analog.filter-mode': 'lowpass',
      'engine.virtual-analog.filter-cutoff': 2600,
      'engine.virtual-analog.filter-resonance': 2,
      'engine.virtual-analog.filter-env-attack': 0,
      'engine.virtual-analog.filter-env-decay': 0,
      'engine.virtual-analog.filter-env-sustain': 1,
      'engine.virtual-analog.filter-env-release': 0.08,
      'engine.virtual-analog.filter-env-amount': 12,
      'engine.virtual-analog.filter-env-route-enabled': true,
      'engine.virtual-analog.pitch-env-attack': 0,
      'engine.virtual-analog.pitch-env-decay': 0,
      'engine.virtual-analog.pitch-env-sustain': 1,
      'engine.virtual-analog.pitch-env-release': 0.08,
      'engine.virtual-analog.pitch-env-osc1-amount': 12,
      'engine.virtual-analog.pitch-env-osc1-enabled': true,
      'engine.virtual-analog.pitch-env-osc2-amount': -12,
      'engine.virtual-analog.pitch-env-osc2-enabled': true,
      'engine.virtual-analog.lfo1-rate': 5,
      'engine.virtual-analog.lfo1-waveform': 'sine',
      'engine.virtual-analog.lfo1-amount': 6,
      'engine.virtual-analog.lfo1-route-enabled': true,
      'engine.virtual-analog.eg-osc1-pitch-amount': 5,
      'engine.virtual-analog.eg-osc1-pitch-enabled': true,
      'engine.virtual-analog.lfo-osc2-pitch-amount': -3,
      'engine.virtual-analog.lfo-osc2-pitch-enabled': true,
    });
    const voiceIds = [];
    for (let index = 0; index < 12; index++) {
      voiceIds.push(await engine.noteOn({
        note: 48 + index,
        frequency: 220 * (2 ** (index / 12)),
        velocity: 0.35,
      }));
    }

    engine.setParameters({ 'global.master-level': 0.25 });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const filterModeChecks = [];
    for (const mode of ['notch', 'allpass']) {
      engine.setParameters({ 'engine.virtual-analog.filter-mode': mode });
      await new Promise((resolve) => setTimeout(resolve, 80));
      const modeSamples = new Float32Array(leftAnalyser.fftSize);
      leftAnalyser.getFloatTimeDomainData(modeSamples);
      const modeRms = Math.sqrt(modeSamples.reduce((sum, sample) => sum + sample * sample, 0) / modeSamples.length);
      if (!Number.isFinite(modeRms) || modeRms < 0.0001) {
        throw new Error(`Filtro ${mode} não produziu sinal finito e mensurável (RMS=${modeRms}).`);
      }
      filterModeChecks.push({ mode, rms: Number(modeRms.toFixed(6)) });
    }
    engine.setParameters({ 'engine.virtual-analog.filter-mode': 'lowpass' });
    const leftSamples = new Float32Array(leftAnalyser.fftSize);
    const rightSamples = new Float32Array(rightAnalyser.fftSize);
    leftAnalyser.getFloatTimeDomainData(leftSamples);
    rightAnalyser.getFloatTimeDomainData(rightSamples);
    const rms = Math.sqrt(leftSamples.reduce((sum, sample) => sum + sample * sample, 0) / leftSamples.length);
    const stereoDifferenceRms = Math.sqrt(leftSamples.reduce((sum, sample, index) => {
      const difference = sample - rightSamples[index];
      return sum + difference * difference;
    }, 0) / leftSamples.length);
    if (!Number.isFinite(rms) || rms < 0.0001) throw new Error(`Saída de áudio sem sinal mensurável (RMS=${rms}).`);
    if (!Number.isFinite(stereoDifferenceRms) || stereoDifferenceRms < 0.00001) {
      throw new Error(`Unison stereo spread não produziu diferença L/R mensurável (RMS diff=${stereoDifferenceRms}).`);
    }

    for (const voiceId of voiceIds) await engine.noteOff(voiceId);
    await new Promise((resolve) => setTimeout(resolve, 120));

    for (let index = 0; index < 40; index++) {
      const rapidVoice = await engine.noteOn({
        note: 60 + (index % 12),
        frequency: 261.6256 * (2 ** ((index % 12) / 12)),
        velocity: 0.25,
        waveform: ['sine', 'saw', 'square'][index % 3],
        envelope: { attack: 0, decay: 0, sustain: 1, release: 0.005 },
      });
      await new Promise((resolve) => setTimeout(resolve, 4));
      await engine.noteOff(rapidVoice);
      await new Promise((resolve) => setTimeout(resolve, 4));
    }

    const soakPairs = 250;
    for (let index = 0; index < soakPairs; index++) {
      const voiceId = await engine.noteOn({
        note: 48 + (index % 24),
        frequency: 130.8128 * (2 ** ((index % 24) / 12)),
        velocity: 0.2,
        waveform: ['sine', 'saw', 'square'][index % 3],
        envelope: { attack: 0, decay: 0, sustain: 1, release: 0.005 },
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
      await engine.noteOff(voiceId);
    }
    if (engine.handles.size !== 0 || engine.noteStacks.size !== 0) {
      throw new Error(`Vazamento de handles após stress: handles=${engine.handles.size}, noteStacks=${engine.noteStacks.size}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    leftAnalyser.getFloatTimeDomainData(leftSamples);
    const residualRms = Math.sqrt(leftSamples.reduce((sum, sample) => sum + sample * sample, 0) / leftSamples.length);
    if (!Number.isFinite(residualRms) || residualRms > 0.002) {
      throw new Error(`A saída não retornou ao silêncio após as notas: RMS=${residualRms}`);
    }
    if (workletErrors.length) throw workletErrors[0];

    await firstContext.suspend();
    if (firstContext.state !== 'suspended') throw new Error(`AudioContext não suspendeu: ${firstContext.state}`);
    await firstContext.resume();
    if (firstContext.state !== 'running') throw new Error(`AudioContext não retomou: ${firstContext.state}`);

    const latency = {
      baseLatency: Number.isFinite(firstContext.baseLatency) ? firstContext.baseLatency : null,
      outputLatency: Number.isFinite(firstContext.outputLatency) ? firstContext.outputLatency : null,
    };
    const sampleRate = firstContext.sampleRate;
    await engine.close();
    await engine.close();
    if (firstContext.state !== 'closed') throw new Error(`AudioContext não fechou: ${firstContext.state}`);

    await engine.initialize();
    const secondContext = engine.context;
    if (!secondContext || secondContext === firstContext || secondContext.state !== 'running') {
      throw new Error('O motor não conseguiu reinicializar com um AudioContext novo.');
    }
    const secondVoice = await engine.noteOn({
      note: 69,
      frequency: 440,
      velocity: 0.5,
      waveform: 'sine',
      envelope: { attack: 0, decay: 0, sustain: 1, release: 0.04 },
    });
    await engine.noteOff(secondVoice);
    await engine.close();

    details.textContent = JSON.stringify({
      sampleRate,
      simultaneousVoices: voiceIds.length,
      audioWorkletLoaded: true,
      liveParameterUpdates: 'passed',
      additionalFilterModes: filterModeChecks,
      oscillator2: 'enabled square at -1 octave',
      noise: 'per-voice pink noise at level 0.2 through shared filter and amp envelope',
      subOscillator: 'enabled square at -1 octave with independent phase per note',
      unison: '3 detuned oscillator lanes per note at 8 cents and 65% stereo spread, both oscillators',
      filterEnvelope: 'EG 02 active at +12 semitones',
      pitchEnvelope: 'EG 03 active at +12/-12 semitones on OSC 01/02',
      lfo: 'LFO 01 sine at 5 Hz and +6 semitones',
      modulationMatrix: 'EG 02 + EG 03 + LFO 01 routes to filter cutoff, independent OSC 01/02 pitch and independent Sub pitch',
      failedWorkletLoadRetry: 'passed',
      rapidNoteOnOffPairs: 40,
      repeatedNoteStressPairs: soakPairs,
      activeHandlesAfterStress: engine.handles.size,
      noteStacksAfterStress: engine.noteStacks.size,
      residualRmsAfterRelease: Number(residualRms.toFixed(7)),
      workletErrors: workletErrors.length,
      measuredRms: Number(rms.toFixed(6)),
      stereoDifferenceRms: Number(stereoDifferenceRms.toFixed(6)),
      suspendResume: 'passed',
      repeatedClose: 'passed',
      reinitializeAfterClose: 'passed',
      audioContextClosed: firstContext.state === 'closed',
      latency,
    }, null, 2);
    status.dataset.status = 'pass';
    status.textContent = 'PASS: polifonia, stress, liberação e ciclo de vida verificados';
  } catch (error) {
    if (engine) await engine.close().catch(() => {});
    status.dataset.status = 'fail';
    status.textContent = `FAIL: ${error.message}`;
    details.textContent = error.stack ?? String(error);
  } finally {
    button.disabled = false;
  }
});
