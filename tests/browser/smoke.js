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

    const analyser = firstContext.createAnalyser();
    analyser.fftSize = 4096;
    engine.node.connect(analyser);

    engine.setParameters({
      'global.master-level': 0.4,
      'engine.virtual-analog.osc-wave': 'sine',
      'engine.virtual-analog.amp-attack': 0,
      'engine.virtual-analog.amp-decay': 0,
      'engine.virtual-analog.amp-sustain': 1,
      'engine.virtual-analog.amp-release': 0.08,
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
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (!Number.isFinite(rms) || rms < 0.0001) throw new Error(`Saída de áudio sem sinal mensurável (RMS=${rms}).`);

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
    analyser.getFloatTimeDomainData(samples);
    const residualRms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
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
      failedWorkletLoadRetry: 'passed',
      rapidNoteOnOffPairs: 40,
      repeatedNoteStressPairs: soakPairs,
      activeHandlesAfterStress: engine.handles.size,
      noteStacksAfterStress: engine.noteStacks.size,
      residualRmsAfterRelease: Number(residualRms.toFixed(7)),
      workletErrors: workletErrors.length,
      measuredRms: Number(rms.toFixed(6)),
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
