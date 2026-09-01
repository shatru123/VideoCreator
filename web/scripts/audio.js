class WebAudioPlayer {
  constructor() {
    this.audioCtx = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.isPlaying = false;
    this.currentTrackSrc = null;

    // Microphone Recording State
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingStartTime = 0;
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  loadAudio(src) {
    this.currentTrackSrc = src;
    this.audioElement.src = src;
  }

  playAt(timeSec, volume = 1.0) {
    this.ensureAudioContext();
    if (!this.currentTrackSrc) return;

    this.audioElement.volume = Math.max(0, Math.min(1, volume));
    if (timeSec >= 0 && timeSec < (this.audioElement.duration || 9999)) {
      this.audioElement.currentTime = timeSec;
      this.audioElement.play().catch(() => {});
      this.isPlaying = true;
    }
  }

  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
  }

  seek(timeSec) {
    if (!this.currentTrackSrc) return;
    if (timeSec >= 0 && timeSec < (this.audioElement.duration || 9999)) {
      this.audioElement.currentTime = timeSec;
    }
  }

  setVolume(vol) {
    this.audioElement.volume = Math.max(0, Math.min(1, vol));
  }

  // --- Royalty-Free Synthesized Stock Music Generator ---
  generateStockMusicTrack(trackId, durationSec = 30) {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * durationSec);
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, numSamples, sampleRate);

    // Chords and BPM settings
    const bpm = trackId === 'pop' ? 124 : (trackId === 'edm' ? 128 : 85);
    const beatSec = 60 / bpm;

    // Master Compressor & Gain
    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(0.7, 0);
    masterGain.connect(offlineCtx.destination);

    // Track Presets
    if (trackId === 'lofi') {
      // Warm Lo-Fi Chords: Cmaj7 - Am7 - Dm7 - G7
      const chords = [
        [261.63, 329.63, 392.00, 493.88], // Cmaj7
        [220.00, 261.63, 329.63, 392.00], // Am7
        [146.83, 174.61, 220.00, 261.63], // Dm7
        [196.00, 246.94, 293.66, 349.23]  // G7
      ];
      let t = 0;
      while (t < durationSec) {
        const chord = chords[Math.floor(t / (beatSec * 4)) % chords.length];
        chord.forEach((freq, idx) => {
          const osc = offlineCtx.createOscillator();
          const g = offlineCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);

          g.gain.setValueAtTime(0.08, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + beatSec * 3.8);

          osc.connect(g);
          g.connect(masterGain);

          osc.start(t + idx * 0.03);
          osc.stop(t + beatSec * 4);
        });
        t += beatSec * 4;
      }
    } else if (trackId === 'pop') {
      // Upbeat Pop: Plucks and Bass (Am - F - C - G)
      const roots = [220, 174.61, 130.81, 196.00];
      let t = 0;
      while (t < durationSec) {
        const root = roots[Math.floor(t / (beatSec * 4)) % roots.length];
        for (let b = 0; b < 4; b++) {
          const osc = offlineCtx.createOscillator();
          const g = offlineCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(root * 2, t + b * beatSec);

          g.gain.setValueAtTime(0.12, t + b * beatSec);
          g.gain.exponentialRampToValueAtTime(0.001, t + b * beatSec + 0.25);

          osc.connect(g);
          g.connect(masterGain);

          osc.start(t + b * beatSec);
          osc.stop(t + b * beatSec + 0.3);
        }
        t += beatSec * 4;
      }
    } else if (trackId === 'ambient') {
      // Shimmering Cinematic Ambient Pad
      const padFreqs = [130.81, 196.00, 261.63, 329.63, 392.00, 523.25];
      padFreqs.forEach(freq => {
        const osc = offlineCtx.createOscillator();
        const g = offlineCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, 0);

        g.gain.setValueAtTime(0.01, 0);
        g.gain.linearRampToValueAtTime(0.06, 3.0);
        g.gain.setValueAtTime(0.06, durationSec - 3.0);
        g.gain.linearRampToValueAtTime(0.001, durationSec);

        osc.connect(g);
        g.connect(masterGain);

        osc.start(0);
        osc.stop(durationSec);
      });
    } else {
      // Acoustic / Electronic Arpeggio
      const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
      let t = 0;
      while (t < durationSec) {
        const note = notes[Math.floor(t / beatSec) % notes.length];
        const osc = offlineCtx.createOscillator();
        const g = offlineCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note, t);

        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        osc.connect(g);
        g.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.45);
        t += beatSec * 0.5;
      }
    }

    return offlineCtx.startRendering().then(renderedBuffer => {
      return this.audioBufferToWavUrl(renderedBuffer);
    });
  }

  audioBufferToWavUrl(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const channels = [];
    let offset = 0;
    let pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    // RIFF identifier
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    // fmt sub-chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // subchunk1size (16 for PCM)
    setUint16(1);  // PCM format
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    // data sub-chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    const blob = new Blob([out], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // --- Live Microphone Voiceover Recording ---
  async startVoiceoverRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recordedChunks = [];
    this.recordingStartTime = performance.now();

    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
    };

    this.mediaRecorder.start();
    return true;
  }

  stopVoiceoverRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording active'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const durationSec = Math.max(0.5, (performance.now() - this.recordingStartTime) / 1000);
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);

        // Stop all tracks to turn off microphone LED
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        this.mediaRecorder = null;

        resolve({ blob, url, duration: parseFloat(durationSec.toFixed(1)) });
      };

      this.mediaRecorder.stop();
    });
  }

  // --- Offline Spectral Energy Beat Detector (100% Free & Native) ---
  async detectBeats(audioSource, maxBeats = 32) {
    let audioBuffer = null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return [];
    const actx = new AudioContextClass({ sampleRate: 44100 });

    if (audioSource instanceof AudioBuffer) {
      audioBuffer = audioSource;
    } else if (typeof audioSource === 'string') {
      try {
        const resp = await fetch(audioSource);
        const ab = await resp.arrayBuffer();
        audioBuffer = await actx.decodeAudioData(ab);
      } catch (err) {
        console.warn('Could not decode audio for beat detection:', err);
      }
    }
    actx.close();

    if (!audioBuffer) return [];

    // Extract mono downmix
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);

    for (let c = 0; c < numChannels; c++) {
      const chData = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        mono[i] += chData[i] / numChannels;
      }
    }

    // Step 1: Calculate short-time RMS energy windows (1024 samples = ~23ms)
    const windowSize = 1024;
    const hopSize = 512;
    const numFrames = Math.floor((length - windowSize) / hopSize);
    const energies = new Float32Array(numFrames);

    for (let f = 0; f < numFrames; f++) {
      const start = f * hopSize;
      let sumSq = 0;
      for (let i = 0; i < windowSize; i++) {
        const s = mono[start + i];
        sumSq += s * s;
      }
      energies[f] = Math.sqrt(sumSq / windowSize);
    }

    // Step 2: Adaptive Local Threshold Peak Detection
    const beatTimes = [];
    const localWindow = 14; // ~300ms window
    const thresholdMultiplier = 1.35;
    const minTimeBetweenBeats = 0.35; // Min 350ms between cuts
    let lastBeatTime = -1;

    for (let f = localWindow; f < numFrames - localWindow; f++) {
      let localSum = 0;
      for (let k = -localWindow; k <= localWindow; k++) {
        localSum += energies[f + k];
      }
      const localAvg = localSum / (localWindow * 2 + 1);
      const curEnergy = energies[f];
      const timeSec = (f * hopSize) / sampleRate;

      if (curEnergy > localAvg * thresholdMultiplier && curEnergy > 0.035) {
        if (curEnergy >= energies[f - 1] && curEnergy >= energies[f + 1]) {
          if (lastBeatTime === -1 || (timeSec - lastBeatTime) >= minTimeBetweenBeats) {
            beatTimes.push(parseFloat(timeSec.toFixed(2)));
            lastBeatTime = timeSec;
            if (beatTimes.length >= maxBeats) break;
          }
        }
      }
    }

    return beatTimes;
  }

  // --- Native Web Speech API Voiceover & Word Tokenizer (100% Free & Native) ---
  synthesizeSpeech(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Web Speech API is not supported in this browser.'));
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = options.pitch !== undefined ? options.pitch : 1.0;
      utterance.rate = options.rate !== undefined ? options.rate : 1.0;

      if (options.voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const found = voices.find(v => v.name === options.voiceName || v.lang === options.voiceName);
        if (found) utterance.voice = found;
      }

      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      const wordDur = Math.max(0.22, 0.42 / (options.rate || 1.0));
      const timedWords = words.map((w, idx) => ({
        word: w,
        startTime: parseFloat((idx * wordDur).toFixed(2)),
        duration: parseFloat(wordDur.toFixed(2))
      }));
      const totalEstimatedDur = parseFloat((words.length * wordDur).toFixed(2));

      resolve({
        text: text,
        words: timedWords,
        duration: totalEstimatedDur,
        utterance: utterance
      });
    });
  }

  getAvailableVoices() {
    if (!('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
  }
}

window.WebAudioPlayer = WebAudioPlayer;
