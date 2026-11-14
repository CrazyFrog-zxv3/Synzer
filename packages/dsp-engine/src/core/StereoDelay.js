const MIN_TIME = 0.005;
const MAX_TIME = 2;

function validate(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

export class StereoDelay {
  constructor({ sampleRate, time = 0.375, feedback = 0.28, mix = 0, pingPong = false } = {}) {
    validate('sampleRate', sampleRate, 8000, 384000);
    this.sampleRate = sampleRate;
    this.capacity = Math.ceil(sampleRate * MAX_TIME) + 2;
    this.leftBuffer = new Float32Array(this.capacity);
    this.rightBuffer = new Float32Array(this.capacity);
    this.writeIndex = 0;
    this.currentDelaySamples = Math.round(time * sampleRate);
    this.targetDelaySamples = this.currentDelaySamples;
    this.feedback = 0.28;
    this.mix = 0;
    this.pingPong = false;
    this.setParameters({ time, feedback, mix, pingPong });
  }

  getParameters() {
    return {
      time: this.targetDelaySamples / this.sampleRate,
      feedback: this.feedback,
      mix: this.mix,
      pingPong: this.pingPong,
    };
  }

  setParameters(values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('Delay parameters must be an object.');
    }
    const time = values.time ?? this.targetDelaySamples / this.sampleRate;
    const feedback = values.feedback ?? this.feedback;
    const mix = values.mix ?? this.mix;
    const pingPong = values.pingPong ?? this.pingPong;
    validate('time', time, MIN_TIME, MAX_TIME);
    validate('feedback', feedback, -0.95, 0.95);
    validate('mix', mix, 0, 1);
    if (typeof pingPong !== 'boolean') throw new TypeError('pingPong must be a boolean.');
    this.targetDelaySamples = time * this.sampleRate;
    this.feedback = feedback;
    this.mix = mix;
    this.pingPong = pingPong;
    return this.getParameters();
  }

  #read(buffer, delaySamples) {
    let position = this.writeIndex - delaySamples;
    while (position < 0) position += this.capacity;
    const index = Math.floor(position);
    const fraction = position - index;
    const next = index + 1 === this.capacity ? 0 : index + 1;
    return buffer[index] + ((buffer[next] - buffer[index]) * fraction);
  }

  process(left, right = left, { bypass = false, wetOnly = false } = {}) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) {
      throw new TypeError('StereoDelay expects matching Float32Array channel buffers.');
    }
    const smoothing = 1 / Math.max(1, Math.round(this.sampleRate * 0.02));
    for (let index = 0; index < left.length; index += 1) {
      this.currentDelaySamples += (this.targetDelaySamples - this.currentDelaySamples) * smoothing;
      const dryLeft = left[index];
      const dryRight = right[index];
      const delayedLeft = this.#read(this.leftBuffer, this.currentDelaySamples);
      const delayedRight = this.#read(this.rightBuffer, this.currentDelaySamples);
      const feedbackLeft = this.pingPong ? delayedRight : delayedLeft;
      const feedbackRight = this.pingPong ? delayedLeft : delayedRight;
      this.leftBuffer[this.writeIndex] = dryLeft + (feedbackLeft * this.feedback);
      this.rightBuffer[this.writeIndex] = dryRight + (feedbackRight * this.feedback);
      left[index] = wetOnly ? (bypass ? 0 : delayedLeft) : (bypass ? dryLeft : (dryLeft * (1 - this.mix)) + (delayedLeft * this.mix));
      if (right !== left) right[index] = wetOnly ? (bypass ? 0 : delayedRight) : (bypass ? dryRight : (dryRight * (1 - this.mix)) + (delayedRight * this.mix));
      this.writeIndex += 1;
      if (this.writeIndex >= this.capacity) this.writeIndex = 0;
    }
    return { left, right };
  }

  reset() {
    this.leftBuffer.fill(0);
    this.rightBuffer.fill(0);
    this.writeIndex = 0;
    this.currentDelaySamples = this.targetDelaySamples;
  }
}
