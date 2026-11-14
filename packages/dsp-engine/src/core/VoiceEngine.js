uld be allocated.');

    const voice = {
      id, note: Math.round(note), frequency, velocity, waveform, phase: 0, phaseIncrement: frequency / this.sampleRate,
      stage: 'attack', envelope: normalizedEnvelope, envelopeLevel: 0,
      stageSamples: 0, startedAt: this.sequence++, releaseStep: 0,
      stealRemaining: 0, stealStartLevel: 0, filter, filterBaseCutoff: this.parameters['engine.virtual-analog.filter-cutoff'], filterEnvelope, pitchEnvelope, lfo, oscillator2,
    };
    this.voices.set(id, voice);
    return id;
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (!voice || voice.stage === 'release' || voice.stage === 'steal') return false;
    if (voice.envelope.release === 0 || voice.envelopeLevel <= 0) {
      this.voices.delete(id);
      return true;
    }
    const filterEnvelope = voice.filterEnvelope;
    const pitchEnvelope = voice.pitchEnvelope;
    if (filterEnvelope.stage !== 'idle' && filterEnvelope.stage !== 'release') {
      if (filterEnvelope.release === 0 || filterEnvelope.level <= 0) {
        filterEnvelope.level = 0;
        filterEnvelope.stage = 'idle';
      } else {
        filterEnvelope.stage = 'release';
        filterEnvelope.stageSamples = 0;
        filterEnvelope.releaseStep = filterEnvelope.level /
          Math.max(1, Math.round(filterEnvelope.release * this.sampleRate));
      }
    }
    if (pitchEnvelope.stage !== 'idle' && pitchEnvelope.stage !== 'release') {
      if (pitchEnvelope.release === 0 || pitchEnvelope.level <= 0) {
        pitchEnvelope.level = 0;
        pitchEnvelope.stage = 'idle';
      } else {
        pitchEnvelope.stage = 'release';
        pitchEnvelope.stageSamples = 0;
        pitchEnvelope.releaseStep = pitchEnvelope.level / Math.max(1, Math.round(pitchEnvelope.release * this.sampleRate));
      }
    }
    voice.stage = 'release';
    voice.stageSamples = 0;
    voice.releaseStartLevel = voice.envelopeLevel;
    voice.releaseStep = voice.releaseStartLevel / Math.max(1, Math.round(voice.envelope.release * this.sampleRate));
    return true;
  }

  #stealOneVoice() {
    let candidate;
    // Prefer an existing release tail; among equal states, steal the oldest.
    this.voices.forEach((voice) => {
      if (voice.stage === 'steal') return;
      if (!candidate || (voice.stage === 'release' && candidate.stage !== 'release') ||
          (voice.stage === candidate.stage && voice.startedAt < candidate.startedAt)) candidate = voice;
    });
    if (!candidate) return;
    candidate.stage = 'steal';
    candidate.stealRemaining = this.stealFadeSamples;
    candidate.stealStartLevel = candidate.envelopeLevel;
    candidate.stageSamples = 0;
  }

  #advanceEnvelope(voice) {
    const env = voice.envelope;
    switch (voice.stage) {
      case 'attack': {
        const total = Math.round(env.attack * this.sampleRate);
        if (total === 0) {
          voice.envelopeLevel = 1;
          voice.stage = env.decay === 0 ? 'sustain' : 'decay';
          voice.stageSamples = 0;
        } else {
          voice.envelopeLevel = Math.min(1, voice.envelopeLevel + 1 / total);
          voice.stageSamples++;
          if (voice.stageSamples >= total) {
            voice.envelopeLevel = 1;
            voice.stage = env.decay === 0 ? 'sustain' : 'decay';
            voice.stageSamples = 0;
          }
        }
        break;
      }
      case 'decay': {
        const total = Math.round(env.decay * this.sampleRate);
        if (total === 0) {
          voice.envelopeLevel = env.sustain;
          voice.stage = 'sustain';
        } else {
          voice.envelopeLevel = Math.max(env.sustain, voice.envelopeLevel - (1 - env.sustain) / total);
          voice.stageSamples++;
          if (voice.stageSamples >= total) {
            voice.envelopeLevel = env.sustain;
            voice.stage = 'sustain';
            voice.stageSamples = 0;
          }
        }
        break;
      }
      case 'release':
        voice.envelopeLevel = Math.max(0, voice.envelopeLevel - voice.releaseStep);
        voice.stageSamples++;
        if (voice.envelopeLevel <= 0 || voice.stageSamples >= Math.max(1, Math.round(env.release * this.sampleRate))) {
          voice.envelopeLevel = 0;
          this.voices.delete(voice.id);
        }
        break;
      case 'steal':
        voice.stealRemaining--;
        voice.envelopeLevel = voice.stealStartLevel * Math.max(0, voice.stealRemaining / this.stealFadeSamples);
        if (voice.stealRemaining <= 0) {
          voice.envelopeLevel = 0;
          this.voices.delete(voice.id);
        }
        break;
      case 'sustain':
      default:
        voice.envelopeLevel = env.sustain;
        break;
    }
  }

  #advancePitchEnvelope(voice) {
    const env = voice.pitchEnvelope;
    switch (env.stage) {
      case 'attack': {
        const total = Math.round(env.attack * this.sampleRate);
        if (total === 0) {
          env.level = 1; env.stage = env.decay === 0 ? 'sustain' : 'decay'; env.stageSamples = 0;
        } else {
          env.level = Math.min(1, env.level + 1 / total); env.stageSamples++;
          if (env.stageSamples >= total) { env.level = 1; env.stage = env.decay === 0 ? 'sustain' : 'decay'; env.stageSamples = 0; }
        }
        break;
      }
      case 'decay': {
        const total = Math.round(env.decay * this.sampleRate);
        if (total === 0) { env.level = env.sustain; env.stage = 'sustain'; env.stageSamples = 0; }
        else { env.level = Math.max(env.sustain, env.level - (1 - env.sustain) / total); env.stageSamples++; if (env.stageSamples >= total) { env.level = env.sustain; env.stage = 'sustain'; env.stageSamples = 0; } }
        break;
      }
      case 'release': {
        env.level = Math.max(0, env.level - env.releaseStep); env.stageSamples++;
        if (env.level <= 0 || env.stageSamples >= Math.max(1, Math.round(env.release * this.sampleRate))) { env.level = 0; env.stage = 'idle'; env.stageSamples = 0; }
        break;
      }
      case 'sustain': env.level = env.sustain; break;
      case 'idle': default: env.level = 0; break;
    }
    return env.level;
  }

  #advanceFilterEnvelope(voice) {
    const env = voice.filterEnvelope;
    switch (env.stage) {
      case 'attack': {
        const total = Math.round(env.attack * this.sampleRate);
        if (total === 0) {
          env.level = 1;
          env.stage = env.decay === 0 ? 'sustain' : 'decay';
          env.stageSamples = 0;
        } else {
          env.level = Math.min(1, env.level + 1 / total);
          env.stageSamples++;
          if (env.stageSamples >= total) {
            env.level = 1;
            env.stage = env.decay === 0 ? 'sustain' : 'decay';
            env.stageSamples = 0;
          }
        }
        break;
      }
      case 'decay': {
        const total = Math.round(env.decay * this.sampleRate);
        if (total === 0) {
          env.level = env.sustain;
          env.stage = 'sustain';
          env.stageSamples = 0;
        } else {
          env.level = Math.max(env.sustain, env.level - (1 - env.sustain) / total);
          env.stageSamples++;
          if (env.stageSamples >= total) {
            env.level = env.sustain;
            env.stage = 'sustain';
            env.stageSamples = 0;
          }
        }
        break;
      }
      case 'release': {
        env.level = Math.max(0, env.level - env.releaseStep);
        env.stageSamples++;
        if (env.level <= 0 || env.stageSamples >= Math.max(1, Math.round(env.release * this.sampleRate))) {
          env.level = 0;
          env.stage = 'idle';
          env.stageSamples = 0;
        }
        break;
      }
      case 'sustain':
        env.level = env.sustain;
        break;
      case 'idle':
      default:
        env.level = 0;
        break;
    }
    return env.level;
  }

  render(left, right = left) {
    if (!(left instanceof Float32Array)) throw new TypeError('Left output must be a Float32Array.');
    if (right !== left && !(right instanceof Float32Array)) throw new TypeError('Right output must be a Float32Array.');
    if (right.length !== left.length) throw new RangeError('Output channels must have equal lengths.');
    left.fill(0);
    if (right !== left) right.fill(0);

    // Snapshot voice references once per render quantum. The scratch array is reused,
    // avoiding a Map callback/iterator allocation for every individual output sample.
    const renderVoices = this.renderVoices;
    renderVoices.length = 0;
    for (const voice of this.voices.values()) renderVoices.push(voice);

    const voiceGain = this.voiceGain * this.masterLevel;
    // Route coefficients are compiled when parameters change and snapshotted once
    // per render quantum, keeping the per-sample path to two multiplies and one sum.
    const filterEnvelopeCutoffAmount = this.modulationMatrix.filterEnvelopeCutoffAmount;
    const lfoCutoffAmount = this.modulationMatrix.lfoCutoffAmount;
    const egOsc1PitchAmount = this.modulationMatrix.filterEnvelopeOsc1PitchAmount;
    const lfoOsc1PitchAmount = this.modulationMatrix.lfoOsc1PitchAmount;
    const egOsc2PitchAmount = this.modulationMatrix.filterEnvelopeOsc2PitchAmount;
    const lfoOsc2PitchAmount = this.modulationMatrix.lfoOsc2PitchAmount;
    const pitchEnvelopeOsc1PitchAmount = this.modulationMatrix.pitchEnvelopeOsc1PitchAmount;
    const pitchEnvelopeOsc2PitchAmount = this.modulationMatrix.pitchEnvelopeOsc2PitchAmount;
    for (let i = 0; i < left.length; i++) {
      let mixed = 0;
      for (let voiceIndex = 0; voiceIndex < renderVoices.length; voiceIndex++) {
        const voice = renderVoices[voiceIndex];
        this.#advanceEnvelope(voice);
        const filterEnvelopeLevel = this.#advanceFilterEnvelope(voice);
        const pitchEnvelopeLevel = this.#advancePitchEnvelope(voice);
        const lfoValue = voice.lfo.oscillator.nextSample();
        const osc1PitchSemitones = (filterEnvelopeLevel * egOsc1PitchAmount) + (pitchEnvelopeLevel * pitchEnvelopeOsc1PitchAmount) + (lfoValue * lfoOsc1PitchAmount);
        const osc2PitchSemitones = (filterEnvelopeLevel * egOsc2PitchAmount) + (pitchEnvelopeLevel * pitchEnvelopeOsc2PitchAmount) + (lfoValue * lfoOsc2PitchAmount);
        const semitones = (filterEnvelopeLevel * filterEnvelopeCutoffAmount) + (lfoValue * lfoCutoffAmount);
        if (voice.filter.mode !== 'off') {
          const modulatedCutoff = semitones === 0
            ? voice.filterBaseCutoff
            : Math.min(
              this.sampleRate * 0.45,
              Math.max(20, voice.filterBaseCutoff * (2 ** (semitones / 12))),
            );
          voice.filter.setCutoff(modulatedCutoff);
        }
        // A voice can expire in the middle of this block while its reference remains
        // in the snapshot. Its zero level keeps the remaining samples silent.
        if (voice.envelopeLevel <= 0) continue;

        const oscillatorPhaseIncrement1 = osc1PitchSemitones === 0
          ? voice.phaseIncrement
          : Math.min(this.sampleRate * 0.45, voice.frequency * (2 ** (osc1PitchSemitones / 12))) / this.sampleRate;
        const oscillatorSample1 = renderOscillatorSample(voice.waveform, voice.phase, oscillatorPhaseIncrement1);
        const oscillator2 = voice.oscillator2;
        const oscillatorPhaseIncrement2 = osc2PitchSemitones === 0
          ? oscillator2.phaseIncrement
          : Math.min(this.sampleRate * 0.45, oscillator2.frequency * (2 ** (osc2PitchSemitones / 12))) / this.sampleRate;
        let oscillatorSample = oscillatorSample1;
        if (oscillator2.enabled && oscillator2.level > 0) {
          const oscillatorSample2 = renderOscillatorSample(oscillator2.waveform, oscillator2.phase, oscillatorPhaseIncrement2);
          oscillatorSample = (oscillatorSample1 + (oscillatorSample2 * oscillator2.level)) / (1 + oscillator2.level);
        }
        const filteredSample = voice.filter.process(oscillatorSample);
        mixed += filteredSample * voice.velocity * voice.envelopeLevel * voiceGain;
        voice.phase += oscillatorPhaseIncrement1;
        if (voice.phase >= 1) voice.phase -= 1;
        oscillator2.phase += oscillatorPhaseIncrement2;
        if (oscillator2.phase >= 1) oscillator2.phase -= 1;
      }
      left[i] = mixed;
      if (right !== left) right[i] = mixed;
    }
  }
}