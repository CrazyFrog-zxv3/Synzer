import { createDefaultEngineRegistry } from '../core/EngineRegistry.js';

class SynzerAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options?.processorOptions ?? {};
    this.engineRegistry = createDefaultEngineRegistry();
    this.engineId = config.engineId ?? 'virtual-analog';
    this.engine = this.engineRegistry.create(this.engineId, {
      sampleRate,
      maxVoices: config.maxVoices ?? 12,
      stealFadeSeconds: config.stealFadeSeconds ?? 0.005,
      voiceGain: config.voiceGain ?? 0.075,
    });
    this.port.onmessage = ({ data }) => {
      try {
        if (data?.type === 'SET_ENGINE') {
          if (!this.engineRegistry.has(data.engineId)) throw new Error('Unknown synthesis engine: ' + String(data.engineId));
          this.engine = this.engineRegistry.create(data.engineId, { sampleRate, maxVoices: config.maxVoices ?? 12, voiceGain: config.voiceGain ?? 0.075 });
          this.engineId = data.engineId;
        }
        else if (data?.type === 'SET_PARAMETERS') this.engine.setParameters(data.parameters);
        else if (data?.type === 'NOTE_ON') this.engine.noteOn(data.voice);
        else if (data?.type === 'NOTE_OFF') this.engine.noteOff(data.voiceId);
        else if (data?.type === 'SET_WAVETABLE_MORPH') {
          if (!this.engine.setWavetableMorph(data.voiceId, data.morph)) {
            throw new Error('Wavetable voice not found: ' + String(data.voiceId));
          }
        }
      } catch (error) {
        this.port.postMessage({
          type: 'ENGINE_ERROR',
          message: String(error?.message ?? error),
          commandType: data?.type ?? null,
          voiceId: data?.voice?.id ?? data?.voiceId ?? null,
        });
      }
    };
  }

  process(_inputs, outputs) {
    const channels = outputs[0];
    if (!channels || channels.length === 0) return true;
    const left = channels[0];
    const right = channels[1] ?? left;
    this.engine.render(left, right);
    for (let channel = 2; channel < channels.length; channel++) channels[channel].set(left);
    return true;
  }
}
registerProcessor('synzer-audio-processor', SynzerAudioProcessor);
