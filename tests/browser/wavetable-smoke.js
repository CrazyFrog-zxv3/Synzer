import { SynzerEngine } from '../../packages/dsp-engine/src/core/SynzerEngine.js';

const button = document.querySelector('#run');
const status = document.querySelector('#status');
const details = document.querySelector('#details');

function readTone(analyser, sampleRate, frequency) {
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  const index = Math.round((frequency * analyser.fftSize) / sampleRate);
  return bins[index];
}

button.addEventListener('click', async () => {
  button.disabled = true;
  let engine;
  try {
    engine = new SynzerEngine({
      workletUrl: new URL('../../packages/dsp-engine/src/worklets/synzer-processor.js', import.meta.url),
      maxVoices: 4,
    });
    engine.setParameters({
      'global.master-level': 1,
      'engine.virtual-analog.amp-attack': 0,
      'engine.virtual-analog.amp-decay': 0,
      'engine.virtual-analog.amp-sustain': 1,
      'engine.virtual-analog.amp-release': 0.1,
    });
    await engine.initialize();
    const voiceId = await engine.noteOn({
      note: 69,
      frequency: 440,
      velocity: 1,
      wavetable: {
        size: 2048,
        morph: 0,
        partialFrames: [
          [{ harmonic: 1, amplitude: 1 }],
          [{ harmonic: 2, amplitude: 1 }],
        ],
      },
    });
    const analyser = engine.context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    engine.node.connect(analyser);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const fundamentalBefore = readTone(analyser, engine.context.sampleRate, 440);
    const secondBefore = readTone(analyser, engine.context.sampleRate, 880);
    if (!engine.setWavetableMorph(voiceId, 1)) throw new Error('Live morph command was rejected.');
    await new Promise((resolve) => setTimeout(resolve, 180));
    const fundamentalAfter = readTone(analyser, engine.context.sampleRate, 440);
    const secondAfter = readTone(analyser, engine.context.sampleRate, 880);
    if (!(fundamentalBefore > secondBefore + 12)) throw new Error(`Initial frame did not emphasize the fundamental: ${fundamentalBefore} dB vs ${secondBefore} dB.`);
    if (!(secondAfter > fundamentalAfter + 12)) throw new Error(`Morph did not move energy to the second harmonic: ${secondAfter} dB vs ${fundamentalAfter} dB.`);
    status.dataset.status = 'pass';
    status.textContent = 'PASS';
    details.textContent = JSON.stringify({
      sampleRate: engine.context.sampleRate,
      workletReady: true,
      initialFrame: { fundamental440HzDb: Number(fundamentalBefore.toFixed(2)), harmonic880HzDb: Number(secondBefore.toFixed(2)) },
      morphedFrame: { fundamental440HzDb: Number(fundamentalAfter.toFixed(2)), harmonic880HzDb: Number(secondAfter.toFixed(2)) },
      liveMorph: 'passed',
    }, null, 2);
  } catch (error) {
    status.dataset.status = 'fail';
    status.textContent = 'FAIL';
    details.textContent = error.stack ?? String(error);
  } finally {
    if (engine) await engine.close();
  }
});
