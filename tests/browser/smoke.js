import { SynzerEngine } from '../../packages/dsp-engine/src/core/SynzerEngine.js';

const button = document.querySelector('#run');
const status = document.querySelector('#status');
const details = document.querySelector('#details');

button.addEventListener('click', async () => {
  button.disabled = true;
  let engine;
  try {
    engine = new SynzerEngine({ maxVoices: 4 });
    await engine.initialize();
    const context = engine.context;
    if (context.state !== 'running') throw new Error(`AudioContext não está running: ${context.state}`);

    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    engine.node.connect(analyser);

    const voiceId = await engine.noteOn({
      note: 69,
      frequency: 440,
      velocity: 0.9,
      waveform: 'sine',
      envelope: { attack: 0, decay: 0, sustain: 1, release: 0.08 },
    });

    await new Promise((resolve) => setTimeout(resolve, 180));
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (!Number.isFinite(rms) || rms < 0.0001) throw new Error(`Saída de áudio sem sinal mensurável (RMS=${rms}).`);

    await engine.noteOff(voiceId);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await engine.close();
    if (context.state !== 'closed') throw new Error(`AudioContext não fechou: ${context.state}`);

    details.textContent = JSON.stringify({
      sampleRate: context.sampleRate,
      audioContextStateBeforeClose: 'running',
      workletLoaded: true,
      voiceStarted: true,
      measuredRms: Number(rms.toFixed(6)),
      audioContextClosed: context.state === 'closed',
    }, null, 2);
    status.dataset.status = 'pass';
    status.textContent = 'PASS: AudioWorklet real, sinal e encerramento verificados';
  } catch (error) {
    if (engine) await engine.close().catch(() => {});
    status.dataset.status = 'fail';
    status.textContent = `FAIL: ${error.message}`;
    details.textContent = error.stack ?? String(error);
  } finally {
    button.disabled = false;
  }
});
