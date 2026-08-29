class WebAudioPlayer {
  constructor() {
    this.audioCtx = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.isPlaying = false;
    this.currentTrackSrc = null;
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
}

window.WebAudioPlayer = WebAudioPlayer;
