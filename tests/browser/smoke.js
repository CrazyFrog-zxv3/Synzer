import { SynzerEngine } from '../../packages/dsp-engine/src/core/SynzerEngine.js';

const button = document.querySelector('#run');
const status = document.querySelector('#status');
const details = document.querySelector('#details');

button.addEventListener('click', async () => {
  button.disabled = true;
  let engine;
  try {
    engine = new SynzerEngine({ maxVoices: 12 });
    await engine.initialize();
    const firstContext = engine.context;
    if (firstContext.state !== 'running') throw new Error(`AudioContext não está running: ${firstContext.state}`);

    const analyser = firstContext.createAnalyser();
    analyser.fftSize = 4096;
    engine.node.connect(analyser);

    const voiceIds = [];
    for (let index = 0; index < 12; index++) {
      voiceIds.push(await engine.noteOn({
        note: 48 + index,
        frequency: 220 * (2 ** (index / 12)),
        velocity: 0.35,
        waveform: ['sine', 'saw', 'square'][index % 3],
        envelope: { attack: 0, decay: 0, sustain: 1, release: 0.08 },
      }));
    }

    await new Promise((resolve) => setTimeout(resolve, 220));
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (!Number.isFinite(rms) || rms < 0.0001) throw new Error(`Saída de áudio sem sinal mensurável (RMS=${rms}).`);

    for (const voiceId of voiceIds) await engine.noteOff(voiceId);
    await new Promise((resolve) => setTimeout(resolve, 120));

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
      measuredRms: Number(rms.toFixed(6)),
      suspendResume: 'passed',
      repeatedClose: 'passed',
      reinitializeAfterClose: 'passed',
      audioContextClosed: firstContext.state === 'closed',
      latency,
    }, null, 2);
    status.dataset.status = 'pass';
    status.textContent = 'PASS: polifonia, áudio, ciclo de vida e reinicialização verificados';
  } catch (error) {
    if (engine) await engine.close().catch(() => {});
    status.dataset.status = 'fail';
    status.textContent = `FAIL: ${error.message}`;
    details.textContent = error.stack ?? String(error);
  } finally {
    button.disabled = false;
  }
});
