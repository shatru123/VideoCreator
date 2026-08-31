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
}

window.WebAudioPlayer = WebAudioPlayer;
