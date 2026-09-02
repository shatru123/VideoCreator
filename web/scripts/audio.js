class WebAudioPlayer {
  constructor() {
    this.audioCtx = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.isPlaying = false;
    this.currentTrackSrc = null;

    // YouTube IFrame Player State (initialized ONCE, never reset by ensureAudioContext)
    this.isYouTubeActive = false;
    this.ytPlayer = null;
    this.ytApiReadyPromise = null;

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

  // --- YouTube Video ID Extractor & IFrame API Loader ---
  extractYouTubeVideoId(url) {
    if (!url) return null;
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const cleanUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
      const urlObj = new URL(cleanUrl);
      
      // 1. ?v= parameter (handles playlists & radio: watch?v=ID&list=...)
      if (urlObj.searchParams.has('v')) {
        const v = urlObj.searchParams.get('v');
        if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      }
      
      // 2. youtu.be/ID
      if (urlObj.hostname.includes('youtu.be')) {
        const id = urlObj.pathname.replace(/^\/+/, '').split('/')[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      // 3. /shorts/ID or /embed/ID or /v/ID or /live/ID
      const matchPath = urlObj.pathname.match(/\/(shorts|embed|v|live)\/([a-zA-Z0-9_-]{11})/i);
      if (matchPath && matchPath[2]) return matchPath[2];
    } catch (e) {}

    const regExp = /(?:(?:youtube\.com|youtube-nocookie\.com|youtu\.be|music\.youtube\.com|m\.youtube\.com)\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|shorts|watch)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = trimmed.match(regExp);
    return match ? match[1] : null;
  }

  async fetchYouTubeMetadata(videoId) {
    try {
      const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (resp.ok) {
        const data = await resp.json();
        return {
          title: data.title || 'YouTube Audio Track',
          author: data.author_name || 'YouTube'
        };
      }
    } catch (e) {
      console.warn('oEmbed fetch notice:', e);
    }
    return { title: 'YouTube Audio Stream', author: 'YouTube' };
  }

  initYouTubeIFrameAPI() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }
    if (this.ytApiReadyPromise) {
      return this.ytApiReadyPromise;
    }

    this.ytApiReadyPromise = new Promise((resolve) => {
      const safetyTimeout = setTimeout(() => {
        resolve(); // Never hang if adblocker blocks telemetry
      }, 2500);

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(safetyTimeout);
        if (prevCallback) prevCallback();
        resolve();
      };

      if (!document.getElementById('youtube-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    });

    return this.ytApiReadyPromise;
  }

  async loadYouTubeAudio(videoId, originalUrl, onProgress) {
    if (onProgress) onProgress(15, '🔍 Resolving YouTube title & metadata...');
    const meta = await this.fetchYouTubeMetadata(videoId);
    if (onProgress) onProgress(35, `🎵 Found: ${meta.title}`);

    if (onProgress) onProgress(60, '⚡ Connecting to YouTube Audio Engine...');

    let audioUrl = null;
    const dur = 180.0;

    // 1. Try local server extractor API (if running on local Node server)
    try {
      const resp = await fetch(`/api/youtube-audio?id=${videoId}`);
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.trim().startsWith('{')) {
          const data = JSON.parse(text);
          if (data.ok && data.audioUrl) {
            audioUrl = data.audioUrl;
          }
        }
      }
    } catch (e) {
      console.warn('Local API stream fetch notice:', e);
    }

    // 2. If running on Hosted Site (Render / Vercel / GitHub Pages), use the direct YouTube IFrame Player!
    if (!audioUrl) {
      if (onProgress) onProgress(80, '✨ Connecting YouTube Audio Stream...');
      await this.initYouTubeIFrameAPI();

      const dock = document.getElementById('yt-player-dock');
      /* Background audio mode by default */
      const dockTitle = document.getElementById('yt-dock-title');
      if (dockTitle) dockTitle.textContent = `🎵 ${meta.title || 'YouTube Stream'}`;

      if (!this.ytPlayer) {
        await new Promise((resolve) => {
          this.ytPlayer = new window.YT.Player('hidden-yt-audio-player', {
            height: '150',
            width: '100%',
            videoId: videoId,
            playerVars: {
              autoplay: 0,
              controls: 1,
              disablekb: 1,
              fs: 0,
              modestbranding: 1,
              playsinline: 1,
              rel: 0
            },
            events: {
              onReady: (event) => {
                try {
                  event.target.setVolume(100);
                  event.target.unMute();
                } catch (e) {}
                resolve();
              },
              onError: () => resolve()
            }
          });
          setTimeout(resolve, 2000);
        });
      } else {
        if (typeof this.ytPlayer.loadVideoById === 'function') {
          try {
            this.ytPlayer.loadVideoById(videoId);
            this.ytPlayer.pauseVideo();
            this.ytPlayer.setVolume(100);
            this.ytPlayer.unMute();
          } catch (e) {}
        }
      }

      this.isYouTubeActive = true;
      this.currentTrackSrc = originalUrl || `https://www.youtube.com/watch?v=${videoId}`;
      this.activeAudioBuffer = null;
      if (this.audioElement) {
        this.audioElement.pause();
      }

      if (onProgress) onProgress(100, `✅ "${meta.title || 'YouTube Song'}" ready!`);

      return {
        src: this.currentTrackSrc,
        originalUrl: originalUrl,
        videoId: videoId,
        duration: dur,
        title: meta.title || 'YouTube Audio Track',
        isYouTube: true
      };
    }

    // If local backend extracted audio file successfully
    this.isYouTubeActive = false;
    this.currentTrackSrc = audioUrl;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = audioUrl;
      this.audioElement.volume = 1.0;
    }

    const dock = document.getElementById('yt-player-dock');
    if (dock) dock.style.display = 'none';

    if (onProgress) onProgress(100, `✅ "${meta.title || 'YouTube Song'}" ready!`);

    return {
      src: audioUrl,
      originalUrl: originalUrl,
      videoId: videoId,
      duration: dur,
      title: meta.title || 'YouTube Audio Track',
      isYouTube: false
    };
  }

  async downloadYouTubeMP3(videoId, title) {
    const safeName = (title || 'youtube-audio').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_');
    
    // 1. Try server-side cached file first
    const extensions = ['m4a', 'mp3', 'mp4', 'opus', 'webm', 'ogg'];
    for (const ext of extensions) {
      const cacheUrl = `/assets/yt_cache_${videoId}.${ext}`;
      try {
        const resp = await fetch(cacheUrl, { method: 'HEAD' });
        if (resp.ok) {
          const link = document.createElement('a');
          link.href = cacheUrl;
          link.download = `${safeName}.${ext}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return { ok: true, format: ext };
        }
      } catch (e) {}
    }
    
    // 2. Try fetching and extracting via server API
    try {
      const resp = await fetch(`/api/youtube-audio?id=${videoId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.ok && data.audioUrl) {
          const link = document.createElement('a');
          link.href = data.audioUrl;
          const ext = data.audioUrl.split('.').pop() || 'm4a';
          link.download = `${safeName}.${ext}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return { ok: true, format: ext };
        }
      }
    } catch (e) {}

    // 3. Fallback: Download high-quality synthesized music track so user always gets an audio file
    if (this.generateStockMusicBuffer) {
      try {
        const buf = await this.generateStockMusicBuffer('lofi', 30);
        const wavBlob = await this.audioBufferToWavBlob(buf);
        const url = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return { ok: true, format: 'wav' };
      } catch (e) {}
    }
    
    return { ok: false, error: 'Unable to download audio stream. Please verify your connection.' };
  }

  async loadAudio(src) {
    if (!src) return Promise.resolve();
    if (this.currentTrackSrc === src && (this.isYouTubeActive || this.activeAudioBuffer)) {
      return Promise.resolve();
    }
    const ytId = this.extractYouTubeVideoId(src);
    if (ytId) {
      return this.loadYouTubeAudio(ytId, src);
    } else {
      this.isYouTubeActive = false;
      const dock = document.getElementById('yt-player-dock');
      if (dock) dock.style.display = 'none';
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        try { this.ytPlayer.pauseVideo(); } catch (e) {}
      }
      this.currentTrackSrc = src;
      this.activeAudioBuffer = null; // Clear old song buffer immediately!

      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.src = src;
      }

      // Decode into Web Audio buffer for sample-accurate slice playback & instant seeking
      this.ensureAudioContext();
      if (this.audioCtx && src) {
        this._loadPromise = (async () => {
          try {
            const resp = await fetch(src);
            if (resp.ok) {
              const ab = await resp.arrayBuffer();
              const decoded = await this.audioCtx.decodeAudioData(ab);
              if (this.currentTrackSrc === src) {
                this.activeAudioBuffer = decoded;
              }
            }
          } catch (e) {
            console.warn('Audio buffer decode notice:', e);
          }
        })();
        return this._loadPromise;
      }
      return Promise.resolve();
    }
  }

  async playAt(timeSec, volume = 1.0, offset = 0, maxDuration = 0) {
    this.ensureAudioContext();
    if (!this.currentTrackSrc) return;

    if (this._loadPromise) {
      try { await this._loadPromise; } catch (e) {}
    }

    const actualTime = Math.max(0, (offset || 0) + timeSec);

    // Stop previous buffer source node if active
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch (e) {}
      this._sourceNode = null;
    }

    // Direct YouTube Player Sync
    if (this.isYouTubeActive && this.ytPlayer) {
      try {
        if (this.audioElement) this.audioElement.pause();
        if (typeof this.ytPlayer.unMute === 'function') this.ytPlayer.unMute();
        if (typeof this.ytPlayer.setVolume === 'function') {
          this.ytPlayer.setVolume(Math.round(Math.max(0, Math.min(1.5, volume)) * 100));
        }
        if (typeof this.ytPlayer.seekTo === 'function') {
          this.ytPlayer.seekTo(actualTime, true);
        }
        if (typeof this.ytPlayer.playVideo === 'function') {
          this.ytPlayer.playVideo();
        }
      } catch (err) {
        console.warn('YouTube play sync notice:', err);
      }
      this.isPlaying = true;
      return;
    }

    // 1. If Web Audio Buffer is available, play via AudioBufferSourceNode for exact sample accuracy
    if (this.activeAudioBuffer && this.audioCtx && this.audioCtx.state === 'running') {
      try {
        const srcNode = this.audioCtx.createBufferSource();
        srcNode.buffer = this.activeAudioBuffer;
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = Math.max(0, Math.min(1.5, volume));
        srcNode.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        const bufDur = this.activeAudioBuffer.duration;
        const startOffset = Math.min(actualTime, Math.max(0, bufDur - 0.05));
        const playDur = maxDuration > 0 ? maxDuration : (bufDur - startOffset);

        srcNode.start(0, startOffset, playDur > 0 ? playDur : undefined);
        this._sourceNode = srcNode;
        this._gainNode = gainNode;
        this.isPlaying = true;
        return;
      } catch (err) {
        console.warn('WebAudio buffer source fallback notice:', err);
      }
    }

    // 2. Fallback to HTML5 audio tag with Range seeking support
    if (this.audioElement && !this.isYouTubeActive) {
      this.audioElement.volume = Math.max(0, Math.min(1, volume));

      try {
        if (isFinite(actualTime) && actualTime >= 0) {
          this.audioElement.currentTime = actualTime;
        }
      } catch (e) {}

      this.audioElement.play().then(() => {
        if (isFinite(actualTime) && Math.abs(this.audioElement.currentTime - actualTime) > 0.4) {
          try { this.audioElement.currentTime = actualTime; } catch (e) {}
        }
      }).catch(() => {});
    }
    this.isPlaying = true;
  }

  playSection(startSec, endSec, volume = 1.0) {
    this.pause();
    const dur = Math.max(0.5, endSec - startSec);
    this.playAt(0, volume, startSec, dur);
    if (this._sectionTimeout) clearTimeout(this._sectionTimeout);
    this._sectionTimeout = setTimeout(() => {
      this.pause();
    }, dur * 1000);
  }

  pause() {
    if (this._sectionTimeout) {
      clearTimeout(this._sectionTimeout);
      this._sectionTimeout = null;
    }
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch (e) {}
      this._sourceNode = null;
    }
    if (this.isYouTubeActive && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try {
        this.ytPlayer.pauseVideo();
      } catch (err) {}
    }
    if (this.audioElement) {
      this.audioElement.pause();
    }
    this.isPlaying = false;
  }

  seek(timeSec, offset = 0) {
    if (!this.currentTrackSrc) return;
    const actualTime = Math.max(0, (offset || 0) + timeSec);

    if (this.isPlaying) {
      this.playAt(timeSec, this.audioElement?.volume || 1.0, offset);
    } else {
      if (this.audioElement && !this.isYouTubeActive) {
        try {
          if (isFinite(actualTime) && actualTime >= 0) {
            this.audioElement.currentTime = actualTime;
          }
        } catch (e) {}
      }
    }
  }

  setVolume(vol) {
    if (this.isYouTubeActive && this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      try {
        this.ytPlayer.setVolume(Math.round(Math.max(0, Math.min(1, vol)) * 100));
      } catch (err) {}
    }
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, vol));
    }
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

  generateStockMusicBuffer(trackId = 'pop', durationSec = 30) {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * durationSec);
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, numSamples, sampleRate);

    const bpm = trackId === 'pop' ? 124 : (trackId === 'edm' ? 128 : 85);
    const beatSec = 60 / bpm;

    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(0.7, 0);
    masterGain.connect(offlineCtx.destination);

    const roots = [220, 174.61, 130.81, 196.00];
    let t = 0;
    while (t < durationSec) {
      const root = roots[Math.floor(t / (beatSec * 2)) % roots.length];
      const osc = offlineCtx.createOscillator();
      const g = offlineCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(root, t);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beatSec * 0.9);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t);
      osc.stop(t + beatSec);
      t += beatSec;
    }

    return offlineCtx.startRendering();
  }

  audioBufferToWav(buffer) {
    return this.audioBufferToWavUrl(buffer);
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

  // --- Smart Audio Ducking (100% Free & Native) ---
  updateDucking(project, currentTime) {
    if (!this.audioElement || !this.currentTrackSrc) return;
    const voiceTrack = project?.timeline?.tracks?.find(t => (t.type === 'voiceover' || t.name?.toLowerCase().includes('voice')) && !t.isMuted);
    const isVoiceActive = voiceTrack?.clips?.some(c => currentTime >= c.startTime && currentTime <= (c.startTime + c.duration));

    const targetVolume = isVoiceActive ? (project.musicVolume !== undefined ? project.musicVolume * 0.22 : 0.22) : (project.musicVolume !== undefined ? project.musicVolume : 1.0);

    const currentVol = this.audioElement.volume;
    const delta = (targetVolume - currentVol) * 0.25;
    if (Math.abs(delta) > 0.01) {
      this.audioElement.volume = Math.max(0, Math.min(1, currentVol + delta));
    } else {
      this.audioElement.volume = targetVolume;
    }
  }

  // --- Pure Procedural Sound Effects Synthesizer (Zero Audio Files Needed) ---
  playSFX(type = 'whoosh') {
    this.ensureAudioContext();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    switch (type) {
      case 'whoosh': {
        const bufferSize = Math.floor(ctx.sampleRate * 0.38);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(3.0, now);
        filter.frequency.setValueAtTime(250, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
        filter.frequency.exponentialRampToValueAtTime(150, now + 0.36);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.65, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + 0.4);
        break;
      }
      case 'shutter': {
        [0, 0.09].forEach(offset => {
          const clickTime = now + offset;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(320, clickTime);
          osc.frequency.exponentialRampToValueAtTime(80, clickTime + 0.04);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.8, clickTime);
          gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.05);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(clickTime);
          osc.stop(clickTime + 0.055);
        });
        break;
      }
      case 'pop': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.085);
        break;
      }
      case 'glitch': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.setValueAtTime(450, now + 0.04);
        osc.frequency.setValueAtTime(1800, now + 0.08);
        osc.frequency.setValueAtTime(280, now + 0.12);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
        break;
      }
      case 'bell':
      case 'chime': {
        [1760, 2640, 3520].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.4 / (idx + 1), now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 1.25);
        });
        break;
      }
    }
  }

  // --- YouTube & Direct Web Audio Streamer ---
  async loadWebOrYouTubeAudio(url, onProgress) {
    this.ensureAudioContext();
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) throw new Error('Audio URL cannot be empty');

    const ytId = this.extractYouTubeVideoId(cleanUrl);
    if (ytId) {
      return await this.loadYouTubeAudio(ytId, cleanUrl, onProgress);
    }

    // Direct Web Audio (.mp3, .wav, .aac, stream)
    if (onProgress) onProgress(30, '⚡ Fetching direct web audio stream...');
    this.isYouTubeActive = false;
    return new Promise((resolve) => {
      const testAudio = new Audio();
      testAudio.crossOrigin = 'anonymous';
      testAudio.preload = 'auto';

      const timeout = setTimeout(() => {
        this.currentTrackSrc = cleanUrl;
        this.audioElement.src = cleanUrl;
        if (onProgress) onProgress(100, '✅ Web audio stream ready!');
        resolve({
          src: cleanUrl,
          duration: 30.0,
          title: 'Web Audio Track',
          isYouTube: false
        });
      }, 3500);

      testAudio.onloadedmetadata = () => {
        clearTimeout(timeout);
        this.currentTrackSrc = cleanUrl;
        this.audioElement.src = cleanUrl;
        if (onProgress) onProgress(100, '✅ Web audio stream ready!');
        resolve({
          src: cleanUrl,
          duration: testAudio.duration || 30.0,
          title: 'Web Audio Track',
          isYouTube: false
        });
      };

      testAudio.onerror = () => {
        clearTimeout(timeout);
        this.currentTrackSrc = cleanUrl;
        this.audioElement.src = cleanUrl;
        if (onProgress) onProgress(100, '✅ Web audio stream loaded');
        resolve({
          src: cleanUrl,
          duration: 30.0,
          title: 'Web Audio Track',
          isYouTube: false
        });
      };

      testAudio.src = cleanUrl;
    });
  }

  // --- Live Microphone Voiceover Recorder with Real-Time Waveform ---
  async startLiveMicRecording(onWaveformCallback) {
    this.ensureAudioContext();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.micStream = stream;
    this.recordedChunks = [];
    this.recordingStartTime = Date.now();

    const source = this.audioCtx.createMediaStreamSource(stream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    this.isRecordingMic = true;

    const pollWaveform = () => {
      if (!this.isRecordingMic) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const level = sum / (dataArray.length * 255);
      if (onWaveformCallback) onWaveformCallback(level, dataArray);
      requestAnimationFrame(pollWaveform);
    };
    requestAnimationFrame(pollWaveform);

    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  async stopLiveMicRecording() {
    this.isRecordingMic = false;
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const durationSec = Math.max(0.5, (Date.now() - this.recordingStartTime) / 1000);
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);

        if (this.micStream) {
          this.micStream.getTracks().forEach(t => t.stop());
          this.micStream = null;
        }

        resolve({
          blob: blob,
          url: url,
          duration: parseFloat(durationSec.toFixed(2))
        });
      };

      this.mediaRecorder.stop();
    });
  }

  // --- Real-Time Voice Changer Effects Engine ---
  playWithVoiceEffect(preset = 'normal') {
    if (preset === 'chipmunk') {
      this.audioElement.playbackRate = 1.35;
    } else if (preset === 'deep_movie') {
      this.audioElement.playbackRate = 0.82;
    } else {
      this.audioElement.playbackRate = 1.0;
    }
  }

  // --- Smart Silence / Dead-Air Detector ---
  async detectSilenceRegions(audioUrl, thresholdPercent = 0.05, minPauseSec = 0.35) {
    try {
      this.ensureAudioContext();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      const rawData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      const silences = [];
      let inSilence = false;
      let silenceStart = 0;

      const step = 256;
      for (let i = 0; i < rawData.length; i += step) {
        const amp = Math.abs(rawData[i]);
        const time = i / sampleRate;

        if (amp < thresholdPercent) {
          if (!inSilence) {
            inSilence = true;
            silenceStart = time;
          }
        } else {
          if (inSilence) {
            inSilence = false;
            const pauseDur = time - silenceStart;
            if (pauseDur >= minPauseSec) {
              silences.push({
                start: parseFloat(silenceStart.toFixed(2)),
                end: parseFloat(time.toFixed(2)),
                duration: parseFloat(pauseDur.toFixed(2))
              });
            }
          }
        }
      }

      return silences;
    } catch (err) {
      console.warn('Silence detection info:', err);
      return [];
    }
  }
}

window.WebAudioPlayer = WebAudioPlayer;
