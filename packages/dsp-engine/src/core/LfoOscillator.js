const LFO_WAVEFORMS = new Set(['sine', 'triangle', 'square', 'saw-up', 'saw-down']);

function assertRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

/** Per-voice, retriggerable low-frequency oscillator with bipolar output. */
export class LfoOscillator {
  constructor({ sampleRate, rate = 1, waveform = 'sine', phase = 0 } = {}) {
    assertRange('sampleRate', sampleRate, 8000, 384000);
    assertRange('rate', rate, 0.05, 20);
    if (!LFO_WAVEFORMS.has(waveform)) throw new TypeError('Unsupported LFO waveform.');
    assertRange('phase', phase, 0, 0.999999999);
    this.sampleRate = sampleRate;
    this.rate = rate;
    this.waveform = waveform;
    this.phase = phase;
    this.phaseIncrement = rate / sampleRate;
  }

  setParameters(values = {}) {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('LFO parameters must be an object.');
    }
    const rate = values.rate ?? this.rate;
    const waveform = values.waveform ?? this.waveform;
    assertRange('rate', rate, 0.05, 20);
    if (!LFO_WAVEFORMS.has(waveform)) throw new TypeError('Unsupported LFO waveform.');
    this.rate = rate;
    this.waveform = waveform;
    this.phaseIncrement = rate / this.sampleRate;
    return this.getParameters();
  }

  getParameters() {
    return { rate: this.rate, waveform: this.waveform };
  }

  nextSample() {
    const phase = this.phase;
    let sample;
    switch (this.waveform) {
      case 'triangle':
        sample = 1 - (4 * Math.abs(phase - 0.5));
        break;
      case 'square':
        sample = phase < 0.5 ? 1 : -1;
        break;
      case 'saw-up':
        sample = (2 * phase) - 1;
        break;
      case 'saw-down':
        sample = 1 - (2 * phase);
        break;
      case 'sine':
      default:
        sample = Math.sin(2 * Math.PI * phase);
        break;
    }
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    return sample;
  }
}
