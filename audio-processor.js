class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noiseGate = -50; // dB threshold for noise gate
    this.compressionRatio = 0.7;
    this.previousSamples = new Array(128).fill(0);
    this.bufferIndex = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const audioData = input[0];
      const enhancedAudio = this.enhanceAudio(audioData);
      
      // Send enhanced audio to main thread
      this.port.postMessage({
        audio: enhancedAudio,
        rms: this.calculateRMS(enhancedAudio),
        timestamp: currentTime
      });
    }
    return true;
  }

  enhanceAudio(samples) {
    const enhanced = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      let sample = samples[i];
      
      // High-pass filter for noise reduction
      sample = this.highPassFilter(sample, i);
      
      // Dynamic range compression
      sample = this.compress(sample);
      
      // Volume normalization
      sample = this.normalize(sample);
      
      enhanced[i] = sample;
    }
    
    return enhanced;
  }

  highPassFilter(sample, index) {
    // Simple high-pass filter to remove low-frequency noise
    const alpha = 0.95;
    const filtered = sample - this.previousSamples[this.bufferIndex] + alpha * (index > 0 ? this.previousSamples[(this.bufferIndex + 127) % 128] : 0);
    
    this.previousSamples[this.bufferIndex] = sample;
    this.bufferIndex = (this.bufferIndex + 1) % 128;
    
    return filtered;
  }

  compress(sample) {
    // Dynamic range compression
    const threshold = 0.5;
    const ratio = this.compressionRatio;
    
    if (Math.abs(sample) > threshold) {
      const excess = Math.abs(sample) - threshold;
      const compressedExcess = excess * ratio;
      sample = sample > 0 ? threshold + compressedExcess : -(threshold + compressedExcess);
    }
    
    return sample;
  }

  normalize(sample) {
    // Volume normalization (simple gain adjustment)
    const targetRMS = 0.1;
    const currentRMS = this.calculateRMS([sample]);
    
    if (currentRMS > 0) {
      const gain = Math.min(2.0, targetRMS / currentRMS);
      return sample * gain;
    }
    
    return sample;
  }

  calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
}

registerProcessor('audio-processor', AudioProcessor);
