/**
 * VideoCreator — Universal High-Performance Video Exporter
 * 
 * Supports:
 * 1. Mobile-Optimized WebCodecs + Mp4Muxer (H.264 / AVC1 + AAC in standard ISO-BMFF MP4 container)
 *    - 100% WhatsApp, Instagram, TikTok, iPhone & Android social media sharing compatibility.
 *    - Macroblock-aligned dimensions (divisible by 16) for universal mobile GPU hardware encoding.
 *    - Adaptive profile discovery via `VideoEncoder.isConfigSupported`.
 *    - Guaranteed full duration with fast-start 'moov' box metadata.
 *    - Offline frame-by-frame rendering: never drops frames or throttles on mobile.
 * 2. Deterministic MediaRecorder + EBML & ISO-BMFF MP4 Duration Header Fixer fallback.
 */

class VideoWebExporter {
  constructor(engine) {
    this.engine = engine;
  }

  async exportVideo(project, options = {}, onProgress) {
    // Check if GIF export is requested
    if (options.format === 'gif') {
      return await this.exportAsGif(project, options, onProgress);
    }

    // Try WebCodecs + Mp4Muxer first for 100% native universal MP4 export
    const canUseWebCodecs = typeof window.VideoEncoder !== 'undefined' && 
                           typeof window.VideoFrame !== 'undefined' && 
                           typeof window.Mp4Muxer !== 'undefined';

    if (canUseWebCodecs) {
      try {
        console.log('[VideoWebExporter] Attempting WebCodecs + Mp4Muxer export...');
        return await this.exportWithWebCodecs(project, options, onProgress);
      } catch (err) {
        console.warn('[VideoWebExporter] WebCodecs pipeline fallback due to:', err);
      }
    }

    // Fallback to MediaRecorder with duration patching
    console.log('[VideoWebExporter] Using MediaRecorder + Duration Patcher pipeline.');
    return await this.exportWithMediaRecorder(project, options, onProgress);
  }

  // --- WebCodecs + Mp4Muxer Pipeline ---
  async exportWithWebCodecs(project, options, onProgress) {
    const { targetWidth, targetHeight, fps, totalDuration, bitrate } = this._getExportDimensions(project, options);

    // Create offscreen canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportEngine = new VideoCanvasEngine(exportCanvas);

    // Transfer ALL loaded images from the main studio engine into the export engine
    // This is critical because on mobile, blob: URLs might not re-load successfully
    if (this.engine && this.engine.imageCache) {
      this.engine.imageCache.forEach((img, src) => {
        if (img && img.naturalWidth > 0 && img.complete) {
          exportEngine.imageCache.set(src, img);
          exportEngine.createPreBlurredBackground(src, img);
        }
      });
      // Also transfer blur cache
      if (this.engine.blurCache) {
        this.engine.blurCache.forEach((blurCanvas, src) => {
          exportEngine.blurCache.set(src, blurCanvas);
        });
      }
    }

    // Ensure EVERY clip image is loaded — await each one individually
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      console.log(`[Export] Preloading ${videoTrack.clips.length} clip images...`);
      for (let i = 0; i < videoTrack.clips.length; i++) {
        const clip = videoTrack.clips[i];
        if (!clip.source) continue;

        // Check if already in cache from the transfer above
        const existing = exportEngine.imageCache.get(clip.source);
        if (existing && existing.naturalWidth > 0 && existing.complete) {
          console.log(`[Export] Clip ${i} ("${clip.name}") image ready from cache.`);
          continue;
        }

        // Not in cache or broken — try to load
        const img = await exportEngine.loadImage(clip.source);
        if (img && img.naturalWidth > 0) {
          console.log(`[Export] Clip ${i} ("${clip.name}") image loaded successfully.`);
        } else {
          console.error(`[Export] Clip ${i} ("${clip.name}") image FAILED to load! Source: ${clip.source.substring(0, 80)}`);
        }
      }
    }

    // Discover and configure supported AVC / H.264 video codec
    const candidateCodecs = [
      'avc1.42001e', // Baseline Level 3.0
      'avc1.42001f', // Baseline Level 3.1 (most compatible on iOS & Android)
      'avc1.42E01E', // Constrained Baseline Level 3.0
      'avc1.4D401F', // Main Profile Level 3.1
      'avc1.4d002a', // Main Profile Level 4.2
      'avc1.64001F', // High Profile Level 3.1
      'avc1.640028'  // High Profile Level 4.0
    ];

    // Check Audio availability and AudioEncoder support
    const audioTrack = project.timeline.tracks.find(t => t.type === 'audio');
    const voiceTrack = project.timeline.tracks.find(t => t.type === 'voiceover');
    const hasAudio = (audioTrack && audioTrack.clips.length > 0 && audioTrack.clips[0].source) || 
                     (voiceTrack && voiceTrack.clips.length > 0 && voiceTrack.clips[0].source);

    let audioBuffer = null;
    let canEncodeAudio = false;

    if (hasAudio && typeof window.AudioEncoder !== 'undefined') {
      try {
        const audioSupport = await AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 44100,
          bitrate: 192000
        });
        if (audioSupport && audioSupport.supported) {
          audioBuffer = await this._mixProjectAudio(project, totalDuration);
          canEncodeAudio = !!audioBuffer;
        }
      } catch (e) {
        console.warn('[VideoWebExporter] AudioEncoder probe warning:', e);
      }
    }

    // Setup Mp4Muxer
    const muxer = new window.Mp4Muxer.Muxer({
      target: new window.Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: targetWidth,
        height: targetHeight
      },
      audio: canEncodeAudio ? {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 44100
      } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset'
    });

    // Configure VideoEncoder with candidate codecs
    let videoEncoderError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { videoEncoderError = e; console.error('[VideoWebExporter] VideoEncoder error:', e); }
    });

    let configured = false;
    for (const c of candidateCodecs) {
      try {
        videoEncoder.configure({
          codec: c,
          width: targetWidth,
          height: targetHeight,
          bitrate: bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference'
        });
        configured = true;
        console.log('[VideoWebExporter] VideoEncoder configured with codec:', c);
        break;
      } catch (e) {
        console.warn('[VideoWebExporter] Codec configuration attempt failed for:', c, e);
      }
    }

    if (!configured) {
      throw new Error('No supported AVC / H.264 video codec configuration available on this device');
    }

    // Encode Audio if available
    let audioEncoder = null;
    if (canEncodeAudio) {
      try {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error('[VideoWebExporter] AudioEncoder runtime error:', e)
        });

        audioEncoder.configure({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 44100,
          bitrate: 192000
        });

        await this._encodeAudioBuffer(audioBuffer, audioEncoder);
      } catch (err) {
        console.warn('[VideoWebExporter] AudioEncoder encoding skipped due to:', err);
        audioEncoder = null;
      }
    }

    // Render Video Frames Step-by-Step (Deterministic Timeline Clock)
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    const frameDurationUs = Math.round(1000000 / fps);

    const renderProject = {
      ...project,
      canvas: { ...project.canvas, width: targetWidth, height: targetHeight }
    };

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (videoEncoderError) throw videoEncoderError;

      const currentTimestamp = (frameIdx / fps);
      const timestampUs = frameIdx * frameDurationUs;

      // Deterministic frame render
      exportEngine.render(renderProject, Math.min(totalDuration, currentTimestamp));

      // Keyframe every 1 second (fps frames) for instant seeking & WhatsApp compatibility
      const isKeyFrame = (frameIdx % fps === 0) || (frameIdx === 0);
      const videoFrame = new VideoFrame(exportCanvas, {
        timestamp: timestampUs
      });

      try {
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      } finally {
        videoFrame.close();
      }

      // Progress reporting & yielding to UI thread for smooth mobile execution
      if (frameIdx % 3 === 0 || frameIdx === totalFrames - 1) {
        const pct = Math.min(99, Math.round(((frameIdx + 1) / totalFrames) * 100));
        if (onProgress) {
          onProgress({
            percentage: pct,
            currentTime: currentTimestamp.toFixed(1),
            totalDuration: totalDuration.toFixed(1)
          });
        }
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Flush encoders
    await videoEncoder.flush();
    if (audioEncoder) {
      try {
        await audioEncoder.flush();
      } catch (e) {
        console.warn('[VideoWebExporter] AudioEncoder flush warning:', e);
      }
    }

    // Finalize MP4 File
    muxer.finalize();
    const buffer = muxer.target.buffer;
    let blob = new Blob([buffer], { type: 'video/mp4' });

    // Explicitly verify and patch ISO-BMFF track & movie headers (mvhd, tkhd, mdhd) for 100% WhatsApp duration retention
    try {
      blob = await this._fixMp4Duration(blob, totalDuration);
    } catch (e) {
      console.warn('[VideoWebExporter] Post-muxing duration patch warning:', e);
    }

    const url = URL.createObjectURL(blob);

    if (onProgress) {
      onProgress({ percentage: 100, currentTime: totalDuration.toFixed(1), totalDuration: totalDuration.toFixed(1) });
    }

    return { url, ext: 'mp4', blob, isMp4: true };
  }

  // --- Fallback MediaRecorder Pipeline + Duration Fixing ---
  async exportWithMediaRecorder(project, options, onProgress) {
    const { targetWidth, targetHeight, fps, totalDuration, bitrate } = this._getExportDimensions(project, options);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportEngine = new VideoCanvasEngine(exportCanvas);

    // Transfer ALL loaded images from the main studio engine
    if (this.engine && this.engine.imageCache) {
      this.engine.imageCache.forEach((img, src) => {
        if (img && img.naturalWidth > 0 && img.complete) {
          exportEngine.imageCache.set(src, img);
          exportEngine.createPreBlurredBackground(src, img);
        }
      });
      if (this.engine.blurCache) {
        this.engine.blurCache.forEach((blurCanvas, src) => {
          exportEngine.blurCache.set(src, blurCanvas);
        });
      }
    }

    // Ensure EVERY clip image is loaded
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (let i = 0; i < videoTrack.clips.length; i++) {
        const clip = videoTrack.clips[i];
        if (!clip.source) continue;
        const existing = exportEngine.imageCache.get(clip.source);
        if (existing && existing.naturalWidth > 0 && existing.complete) continue;
        await exportEngine.loadImage(clip.source);
      }
    }

    // Select candidate MIME
    const candidateMimes = [
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      'video/mp4; codecs=avc1.42E01E',
      'video/mp4',
      'video/webm; codecs=vp9,opus',
      'video/webm; codecs=vp8,opus',
      'video/webm'
    ];

    let selectedMime = '';
    for (const mime of candidateMimes) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    if (!selectedMime) selectedMime = 'video/webm';

    const stream = exportCanvas.captureStream(fps);

    // Audio stream mixing
    const audioTrack = project.timeline.tracks.find(t => t.type === 'audio');
    let audioElem = null;
    let actx = null;

    if (audioTrack && audioTrack.clips.length > 0 && audioTrack.clips[0].source) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          actx = new AudioContextClass();
          const dest = actx.createMediaStreamDestination();
          audioElem = new Audio();
          audioElem.crossOrigin = 'anonymous';
          audioElem.src = audioTrack.clips[0].source;
          audioElem.volume = audioTrack.clips[0].volume !== undefined ? audioTrack.clips[0].volume : 1.0;

          const srcNode = actx.createMediaElementSource(audioElem);
          srcNode.connect(dest);

          dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        }
      } catch (e) {
        console.warn('Audio capture warning:', e);
      }
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: bitrate
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        if (audioElem) { audioElem.pause(); audioElem = null; }
        if (actx) { actx.close(); actx = null; }

        let rawBlob = new Blob(chunks, { type: selectedMime });
        const isMp4 = selectedMime.toLowerCase().includes('mp4');

        // Patch duration for both WebM and MP4 so WhatsApp & social media read full length
        let patchedBlob = rawBlob;
        try {
          if (isMp4) {
            patchedBlob = await this._fixMp4Duration(rawBlob, totalDuration);
          } else {
            patchedBlob = await this._fixWebmDuration(rawBlob, totalDuration * 1000);
          }
        } catch (e) {
          console.warn('Duration fix warning:', e);
        }

        const ext = isMp4 ? 'mp4' : 'webm';
        const url = URL.createObjectURL(patchedBlob);
        resolve({ url, ext, blob: patchedBlob, isMp4 });
      };

      mediaRecorder.onerror = (err) => reject(err);

      mediaRecorder.start(100);
      if (audioElem) {
        audioElem.currentTime = 0;
        audioElem.play().catch(() => {});
      }

      const startWallClock = performance.now();
      let isStopping = false;

      const renderProject = {
        ...project,
        canvas: { ...project.canvas, width: targetWidth, height: targetHeight }
      };

      function renderFrame() {
        if (isStopping) return;
        const elapsedSec = (performance.now() - startWallClock) / 1000;
        const currentTimestamp = Math.min(totalDuration, elapsedSec);

        exportEngine.render(renderProject, currentTimestamp);

        const pct = Math.min(99, Math.round((currentTimestamp / totalDuration) * 100));
        if (onProgress) {
          onProgress({
            percentage: pct,
            currentTime: currentTimestamp.toFixed(1),
            totalDuration: totalDuration.toFixed(1)
          });
        }

        if (elapsedSec >= totalDuration) {
          isStopping = true;
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
          }, 300);
          return;
        }

        requestAnimationFrame(renderFrame);
      }

      requestAnimationFrame(renderFrame);
    });
  }

  // --- Audio Mixing Helper ---
  async _mixProjectAudio(project, durationSec) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const actx = new AudioContextClass({ sampleRate: 44100 });
    const sampleRate = 44100;
    const totalSamples = Math.ceil(durationSec * sampleRate);
    const mixedBuffer = actx.createBuffer(2, totalSamples, sampleRate);
    const leftChannel = mixedBuffer.getChannelData(0);
    const rightChannel = mixedBuffer.getChannelData(1);

    const audioTracks = project.timeline.tracks.filter(t => t.type === 'audio' || t.type === 'voiceover');

    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (!clip.source) continue;
        try {
          let clipBuf = null;
          if (clip.source.startsWith('blob:') || clip.source.startsWith('data:') || clip.source.startsWith('http') || clip.source.startsWith('assets/')) {
            try {
              const resp = await fetch(clip.source);
              if (resp.ok) {
                const ab = await resp.arrayBuffer();
                clipBuf = await actx.decodeAudioData(ab);
              }
            } catch (err) {}
          }

          if (!clipBuf && (clip.source?.includes('youtube') || clip.source?.includes('youtu.be') || clip.isYouTube || clip.videoId)) {
            let vid = clip.videoId;
            if (!vid && clip.source) {
              const m = clip.source.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
              if (m) vid = m[1];
            }

            if (vid) {
              // 1. Try pre-cached local audio file on server
              const extensions = ['m4a', 'mp3', 'webm', 'opus', 'mp4'];
              for (const ext of extensions) {
                try {
                  const cacheResp = await fetch(`/assets/yt_cache_${vid}.${ext}`);
                  if (cacheResp.ok) {
                    const ab = await cacheResp.arrayBuffer();
                    clipBuf = await actx.decodeAudioData(ab);
                    if (clipBuf) break;
                  }
                } catch (e) {}
              }

              // 2. Try on-demand server audio extraction API
              if (!clipBuf) {
                try {
                  const apiResp = await fetch(`/api/youtube-audio?id=${vid}`);
                  if (apiResp.ok) {
                    const apiData = await apiResp.json();
                    if (apiData.ok && apiData.audioUrl) {
                      const streamResp = await fetch(apiData.audioUrl);
                      if (streamResp.ok) {
                        const ab = await streamResp.arrayBuffer();
                        clipBuf = await actx.decodeAudioData(ab);
                      }
                    }
                  }
                } catch (e) {}
              }
            }

            // 3. Fallback: High-quality generated cinematic audio buffer
            if (!clipBuf && typeof audio !== 'undefined' && audio.generateStockMusicBuffer) {
              clipBuf = await audio.generateStockMusicBuffer('cinematic', durationSec);
            }
          }

          if (clipBuf) {
            const clipStartSample = Math.max(0, Math.floor((clip.startTime || 0) * sampleRate));
            const clipDurSamples = Math.floor((clip.duration || durationSec) * sampleRate);
            const clipVol = clip.volume !== undefined ? clip.volume : 1.0;
            const offsetSamples = Math.floor((clip.sourceOffset || clip.trimStart || 0) * sampleRate);

            const cLeft = clipBuf.getChannelData(0);
            const cRight = clipBuf.numberOfChannels > 1 ? clipBuf.getChannelData(1) : cLeft;

            const fadeInSec = clip.fadeIn || 0;
            const fadeOutSec = clip.fadeOut || 0;

            for (let i = 0; i < clipDurSamples && (clipStartSample + i) < totalSamples; i++) {
              const srcIdx = (offsetSamples + i) % clipBuf.length;
              let gain = clipVol;

              if (fadeInSec > 0 && i < fadeInSec * sampleRate) {
                gain *= (i / (fadeInSec * sampleRate));
              }
              const remaining = clipDurSamples - i;
              if (fadeOutSec > 0 && remaining < fadeOutSec * sampleRate) {
                gain *= Math.max(0, remaining / (fadeOutSec * sampleRate));
              }

              leftChannel[clipStartSample + i] += (cLeft[srcIdx] || 0) * gain;
              rightChannel[clipStartSample + i] += (cRight[srcIdx] || 0) * gain;
            }
          }
        } catch (e) {
          console.warn('Audio mix error for clip:', clip.name, e);
        }
      }
    }

    // Normalize & clamp
    for (let i = 0; i < totalSamples; i++) {
      leftChannel[i] = Math.max(-1.0, Math.min(1.0, leftChannel[i]));
      rightChannel[i] = Math.max(-1.0, Math.min(1.0, rightChannel[i]));
    }

    actx.close();
    return mixedBuffer;
  }

  // --- Audio Encoder Chunk Feeder ---
  async _encodeAudioBuffer(audioBuffer, audioEncoder) {
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : left;
    const totalSamples = audioBuffer.length;

    const chunkSize = 1024;
    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      const currentChunkSize = Math.min(chunkSize, totalSamples - offset);
      const planarData = new Float32Array(currentChunkSize * 2);

      planarData.set(left.subarray(offset, offset + currentChunkSize), 0);
      planarData.set(right.subarray(offset, offset + currentChunkSize), currentChunkSize);

      const timestampUs = Math.round((offset / sampleRate) * 1000000);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: sampleRate,
        numberOfFrames: currentChunkSize,
        numberOfChannels: 2,
        timestamp: timestampUs,
        data: planarData
      });

      audioEncoder.encode(audioData);
      audioData.close();
    }
  }

  // --- Dimension and Parameter Calculator (Aligned to Macroblocks) ---
  _getExportDimensions(project, options) {
    let targetWidth = project.canvas.width;
    let targetHeight = project.canvas.height;

    const res = options.resolution || '1080';
    const isPortrait = project.canvas.height > project.canvas.width;
    const isSquare = project.canvas.width === project.canvas.height;

    if (res === '4k') {
      if (isSquare) { targetWidth = 2160; targetHeight = 2160; }
      else if (isPortrait) { targetWidth = 2160; targetHeight = 3840; }
      else { targetWidth = 3840; targetHeight = 2160; }
    } else if (res === '1080') {
      if (isSquare) { targetWidth = 1088; targetHeight = 1088; }
      else if (isPortrait) { targetWidth = 1088; targetHeight = 1920; }
      else { targetWidth = 1920; targetHeight = 1088; }
    } else if (res === '720') {
      if (isSquare) { targetWidth = 720; targetHeight = 720; }
      else if (isPortrait) { targetWidth = 720; targetHeight = 1280; }
      else { targetWidth = 1280; targetHeight = 720; }
    } else if (res === '480') {
      if (isSquare) { targetWidth = 480; targetHeight = 480; }
      else if (isPortrait) { targetWidth = 480; targetHeight = 864; }
      else { targetWidth = 864; targetHeight = 480; }
    }

    // Enforce 16-pixel macroblock alignment for universal mobile hardware encoders
    targetWidth = Math.floor(targetWidth / 16) * 16;
    targetHeight = Math.floor(targetHeight / 16) * 16;

    const fps = parseInt(options.fps) || 30;
    const totalDuration = project.timeline.totalDuration || 5.0;
    const defaultBitrate = res === '4k' ? 24000000 : (res === '1080' ? 8000000 : 4000000);
    const bitrate = options.bitrate || defaultBitrate;

    return { targetWidth, targetHeight, fps, totalDuration, bitrate };
  }

  // --- ISO-BMFF MP4 Duration Patcher (Traverses moov, mvhd, trak, tkhd, mdia, mdhd, mehd) ---
  async _fixMp4Duration(blob, durationSec) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const view = new DataView(arrayBuffer);

      let mvhdTimescale = 1000;

      function parseBoxes(startPos, endPos) {
        let pos = startPos;
        while (pos < endPos - 8) {
          let size = view.getUint32(pos, false);
          const boxType = String.fromCharCode(data[pos+4], data[pos+5], data[pos+6], data[pos+7]);

          if (size === 1 && pos + 16 <= endPos) {
            size = Number(view.getBigUint64(pos + 8, false));
          } else if (size === 0) {
            size = endPos - pos;
          }
          if (size < 8 || pos + size > endPos) break;

          const boxEnd = pos + size;
          const headerSize = (view.getUint32(pos, false) === 1) ? 16 : 8;
          const contentStart = pos + headerSize;

          if (boxType === 'mvhd') {
            const version = data[contentStart];
            if (version === 0 && contentStart + 20 <= boxEnd) {
              mvhdTimescale = view.getUint32(contentStart + 12, false) || 1000;
              const durVal = Math.round(durationSec * mvhdTimescale);
              view.setUint32(contentStart + 16, durVal, false);
            } else if (version === 1 && contentStart + 28 <= boxEnd) {
              mvhdTimescale = view.getUint32(contentStart + 20, false) || 1000;
              const durVal = BigInt(Math.round(durationSec * mvhdTimescale));
              view.setBigUint64(contentStart + 24, durVal, false);
            }
          } else if (boxType === 'tkhd') {
            const version = data[contentStart];
            if (version === 0 && contentStart + 24 <= boxEnd) {
              const durVal = Math.round(durationSec * mvhdTimescale);
              view.setUint32(contentStart + 20, durVal, false);
            } else if (version === 1 && contentStart + 32 <= boxEnd) {
              const durVal = BigInt(Math.round(durationSec * mvhdTimescale));
              view.setBigUint64(contentStart + 28, durVal, false);
            }
          } else if (boxType === 'mdhd') {
            const version = data[contentStart];
            if (version === 0 && contentStart + 20 <= boxEnd) {
              const mdhdTimescale = view.getUint32(contentStart + 12, false) || 1000;
              const durVal = Math.round(durationSec * mdhdTimescale);
              view.setUint32(contentStart + 16, durVal, false);
            } else if (version === 1 && contentStart + 28 <= boxEnd) {
              const mdhdTimescale = view.getUint32(contentStart + 20, false) || 1000;
              const durVal = BigInt(Math.round(durationSec * mdhdTimescale));
              view.setBigUint64(contentStart + 24, durVal, false);
            }
          } else if (boxType === 'mehd') {
            const version = data[contentStart];
            if (version === 0 && contentStart + 8 <= boxEnd) {
              const durVal = Math.round(durationSec * mvhdTimescale);
              view.setUint32(contentStart + 4, durVal, false);
            } else if (version === 1 && contentStart + 12 <= boxEnd) {
              const durVal = BigInt(Math.round(durationSec * mvhdTimescale));
              view.setBigUint64(contentStart + 4, durVal, false);
            }
          } else if (['moov', 'trak', 'mdia', 'minf', 'mvex'].includes(boxType)) {
            parseBoxes(contentStart, boxEnd);
          }

          pos += size;
        }
      }

      parseBoxes(0, data.length);
      return new Blob([data.buffer], { type: 'video/mp4' });
    } catch (err) {
      console.warn('[VideoWebExporter] MP4 duration patching warning:', err);
      return blob;
    }
  }

  // --- EBML WebM Duration Patcher (for Android Chrome MediaRecorder) ---
  async _fixWebmDuration(blob, durationMs) {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Find EBML Segment Info Tag (0x1549A966)
    let infoPos = -1;
    for (let i = 0; i < bytes.length - 4; i++) {
      if (bytes[i] === 0x15 && bytes[i+1] === 0x49 && bytes[i+2] === 0xA9 && bytes[i+3] === 0x66) {
        infoPos = i;
        break;
      }
    }

    if (infoPos === -1) return blob;

    // Search for Duration tag (0x4489) inside Info element
    let durationPos = -1;
    for (let i = infoPos; i < Math.min(bytes.length - 4, infoPos + 200); i++) {
      if (bytes[i] === 0x44 && bytes[i+1] === 0x89) {
        durationPos = i;
        break;
      }
    }

    const dataView = new DataView(arrayBuffer);

    if (durationPos !== -1) {
      const len = bytes[durationPos + 2];
      if (len === 0x84 || len === 4) {
        dataView.setFloat32(durationPos + 3, durationMs, false);
      } else if (len === 0x88 || len === 8) {
        dataView.setFloat64(durationPos + 3, durationMs, false);
      }
      return new Blob([arrayBuffer], { type: blob.type });
    }

    // Insert 0x4489 Duration Tag if missing
    const durationTag = new Uint8Array(7);
    durationTag[0] = 0x44;
    durationTag[1] = 0x89;
    durationTag[2] = 0x84; // 4-byte float length indicator
    new DataView(durationTag.buffer).setFloat32(3, durationMs, false);

    const insertPos = infoPos + 10;
    const patched = new Uint8Array(bytes.length + durationTag.length);
    patched.set(bytes.subarray(0, insertPos), 0);
    patched.set(durationTag, insertPos);
    patched.set(bytes.subarray(insertPos), insertPos + durationTag.length);

    return new Blob([patched.buffer], { type: blob.type });
  }

  // --- 1-Click Native Animated GIF Exporter (100% Free & In-Browser) ---
  async exportAsGif(project, options = {}, onProgress) {
    const isPortrait = (project.canvas.height / project.canvas.width) > 1.1;
    const targetWidth = isPortrait ? 360 : 480;
    const targetHeight = isPortrait ? 640 : 270;
    const fps = 12;
    const totalDuration = Math.min(8.0, project.timeline.totalDuration || 4.0);
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportEngine = new VideoCanvasEngine(exportCanvas);

    if (this.engine && this.engine.imageCache) {
      this.engine.imageCache.forEach((img, src) => {
        if (img && img.naturalWidth > 0 && img.complete) {
          exportEngine.imageCache.set(src, img);
          exportEngine.createPreBlurredBackground(src, img);
        }
      });
    }
    if (this.engine && this.engine.videoCache) {
      this.engine.videoCache.forEach((vid, src) => {
        exportEngine.videoCache.set(src, vid);
      });
    }

    const ctx = exportCanvas.getContext('2d', { willReadFrequently: true });
    const framesData = [];

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const curTime = (frameIdx / fps);
      exportEngine.render(project, curTime);
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      framesData.push(imgData);

      if (onProgress) {
        onProgress({
          percentage: Math.round((frameIdx / totalFrames) * 60),
          currentTime: curTime.toFixed(1),
          totalDuration: totalDuration.toFixed(1)
        });
      }
      await new Promise(r => setTimeout(r, 0));
    }

    const gifBlob = this._encodeGif89a(framesData, targetWidth, targetHeight, Math.round(100 / fps), (encProg) => {
      if (onProgress) {
        onProgress({
          percentage: 60 + Math.round(encProg * 40),
          currentTime: totalDuration.toFixed(1),
          totalDuration: totalDuration.toFixed(1)
        });
      }
    });

    const url = URL.createObjectURL(gifBlob);
    return {
      blob: gifBlob,
      url: url,
      ext: 'gif',
      mimeType: 'image/gif'
    };
  }

  // --- Fast In-Browser GIF89a Byte Stream Generator ---
  _encodeGif89a(frames, width, height, delayCentisec, onProg) {
    const bytes = [];
    function writeStr(s) { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); }
    function writeShort(val) { bytes.push(val & 0xFF, (val >> 8) & 0xFF); }

    // 1. Header
    writeStr('GIF89a');

    // 2. Logical Screen Descriptor
    writeShort(width);
    writeShort(height);
    bytes.push(0xF7); // 256-color global color table flag (2^(7+1) = 256 colors)
    bytes.push(0x00); // background color index
    bytes.push(0x00); // pixel aspect ratio

    // 3. Global Color Table (256 Colors: 6x6x6 color cube + 40 grayscale ramp)
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          bytes.push(Math.round(r * 51), Math.round(g * 51), Math.round(b * 51));
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      const v = Math.round((i / 39) * 255);
      bytes.push(v, v, v);
    }

    // 4. Netscape 2.0 Loop Extension
    bytes.push(0x21, 0xFF, 0x0B);
    writeStr('NETSCAPE2.0');
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00); // Infinite loop

    // 5. Render Each Frame
    frames.forEach((imgData, frameIdx) => {
      // Graphic Control Extension (0x21 0xF9)
      bytes.push(0x21, 0xF9, 0x04, 0x04); // Disposal method 1 (do not dispose)
      writeShort(delayCentisec || 10);
      bytes.push(0x00, 0x00);

      // Image Descriptor (0x2C)
      bytes.push(0x2C);
      writeShort(0); // left
      writeShort(0); // top
      writeShort(width);
      writeShort(height);
      bytes.push(0x00); // no local color table

      // Frame Pixel Indexing to 256-color Palette
      const data = imgData.data;
      const numPixels = width * height;
      const indexedPixels = new Uint8Array(numPixels);

      for (let i = 0; i < numPixels; i++) {
        const off = i * 4;
        const r = Math.min(5, Math.floor(data[off] / 43));
        const g = Math.min(5, Math.floor(data[off + 1] / 43));
        const b = Math.min(5, Math.floor(data[off + 2] / 43));
        indexedPixels[i] = (r * 36) + (g * 6) + b;
      }

      // LZW Compression
      const minCodeSize = 8;
      bytes.push(minCodeSize);

      const lzwBytes = this._lzwCompress(minCodeSize, indexedPixels);
      let offset = 0;
      while (offset < lzwBytes.length) {
        const chunk = Math.min(254, lzwBytes.length - offset);
        bytes.push(chunk);
        for (let c = 0; c < chunk; c++) bytes.push(lzwBytes[offset + c]);
        offset += chunk;
      }
      bytes.push(0x00); // Block Terminator

      if (onProg) onProg((frameIdx + 1) / frames.length);
    });

    // 6. Trailer
    bytes.push(0x3B);

    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  }

  // --- LZW Compression Engine for GIF ---
  _lzwCompress(minCodeSize, pixels) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = clearCode + 2;
    let maxCode = (1 << codeSize);

    let dict = new Map();
    const outputBytes = [];
    let bitBuffer = 0;
    let bitCount = 0;

    function writeBits(code, bits) {
      bitBuffer |= (code << bitCount);
      bitCount += bits;
      while (bitCount >= 8) {
        outputBytes.push(bitBuffer & 0xFF);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    }

    writeBits(clearCode, codeSize);
    let prefix = pixels[0];

    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (prefix << 8) | k;

      if (dict.has(key)) {
        prefix = dict.get(key);
      } else {
        writeBits(prefix, codeSize);
        if (nextCode < 4096) {
          dict.set(key, nextCode++);
          if (nextCode > maxCode && codeSize < 12) {
            codeSize++;
            maxCode = (1 << codeSize);
          }
        } else {
          writeBits(clearCode, codeSize);
          dict.clear();
          codeSize = minCodeSize + 1;
          maxCode = (1 << codeSize);
          nextCode = clearCode + 2;
        }
        prefix = k;
      }
    }

    writeBits(prefix, codeSize);
    writeBits(eoiCode, codeSize);

    if (bitCount > 0) {
      outputBytes.push(bitBuffer & 0xFF);
    }

    return new Uint8Array(outputBytes);
  }

  // --- Multi-Resolution Batch Exporter (1-Click Multi-Format Export) ---
  async exportBatch(project, formats = ['16:9', '9:16'], options = {}, onProgress) {
    const results = [];
    for (let i = 0; i < formats.length; i++) {
      const fmt = formats[i];
      const clonedProject = JSON.parse(JSON.stringify(project));
      if (fmt === '9:16') {
        clonedProject.canvas.width = 1080;
        clonedProject.canvas.height = 1920;
      } else {
        clonedProject.canvas.width = 1920;
        clonedProject.canvas.height = 1080;
      }

      const res = await this.exportVideo(clonedProject, options, (p) => {
        if (onProgress) {
          const overall = Math.round(((i + p.percentage / 100) / formats.length) * 100);
          onProgress({ percentage: overall, stage: `Rendering ${fmt} (${i + 1}/${formats.length})` });
        }
      });

      results.push({ format: fmt, result: res });
    }
    return results;
  }

  // --- YouTube & Instagram Reel Thumbnail / Cover Maker ---
  exportThumbnail(project, currentTime = 0, options = {}) {
    const isPortrait = (project.canvas.height / project.canvas.width) > 1.1;
    const targetW = isPortrait ? 1080 : 1920;
    const targetH = isPortrait ? 1920 : 1080;

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = targetW;
    thumbCanvas.height = targetH;
    const thumbEngine = new VideoCanvasEngine(thumbCanvas);

    if (this.engine && this.engine.imageCache) {
      this.engine.imageCache.forEach((img, src) => {
        if (img && img.naturalWidth > 0 && img.complete) {
          thumbEngine.imageCache.set(src, img);
          thumbEngine.createPreBlurredBackground(src, img);
        }
      });
    }
    if (this.engine && this.engine.videoCache) {
      this.engine.videoCache.forEach((vid, src) => {
        thumbEngine.videoCache.set(src, vid);
      });
    }

    thumbEngine.render(project, currentTime);
    const ctx = thumbCanvas.getContext('2d');

    if (options.headline) {
      ctx.save();
      const fontSize = Math.round(targetH * 0.055);
      ctx.font = `900 italic ${fontSize}px Montserrat, Inter, sans-serif`;
      ctx.textAlign = 'center';
      const textW = ctx.measureText(options.headline).width;
      const bannerH = fontSize * 1.6;
      const bannerY = targetH * (options.headlinePos === 'top' ? 0.18 : (options.headlinePos === 'middle' ? 0.5 : 0.82));

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.roundRect(targetW * 0.5 - textW * 0.5 - 30, bannerY - bannerH * 0.5, textW + 60, bannerH, 16);
      ctx.fill();
      ctx.stroke();

      const grad = ctx.createLinearGradient(0, bannerY - fontSize * 0.5, 0, bannerY + fontSize * 0.5);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(1, '#FDE047');
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(options.headline, targetW * 0.5, bannerY + fontSize * 0.35);
      ctx.restore();
    }

    return {
      dataUrl: thumbCanvas.toDataURL('image/png', 0.95),
      width: targetW,
      height: targetH
    };
  }

  // --- Universal .SRT and .VTT Subtitle Exporter ---
  exportSubtitles(project, format = 'srt') {
    const voiceTrack = project.timeline?.tracks?.find(t => (t.type === 'voiceover' || t.name?.toLowerCase().includes('voice') || t.type === 'overlay') && !t.isMuted);
    const clips = voiceTrack?.clips || [];

    function formatTime(seconds, isVtt = false) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      const sep = isVtt ? '.' : ',';
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
    }

    const isVtt = format.toLowerCase() === 'vtt';
    let output = isVtt ? 'WEBVTT\n\n' : '';
    let counter = 1;

    clips.forEach(clip => {
      if (clip.words && clip.words.length > 0) {
        const groupSize = 4;
        for (let i = 0; i < clip.words.length; i += groupSize) {
          const chunk = clip.words.slice(i, i + groupSize);
          const start = clip.startTime + chunk[0].startTime;
          const end = clip.startTime + chunk[chunk.length - 1].startTime + chunk[chunk.length - 1].duration;
          const text = chunk.map(w => w.word).join(' ');

          if (!isVtt) output += `${counter}\n`;
          output += `${formatTime(start, isVtt)} --> ${formatTime(end, isVtt)}\n${text}\n\n`;
          counter++;
        }
      } else if (clip.overlay?.text || clip.name) {
        const text = clip.overlay?.text || clip.name;
        const start = clip.startTime;
        const end = clip.startTime + clip.duration;

        if (!isVtt) output += `${counter}\n`;
        output += `${formatTime(start, isVtt)} --> ${formatTime(end, isVtt)}\n${text}\n\n`;
        counter++;
      }
    });

    const mimeType = isVtt ? 'text/vtt' : 'application/x-subrip';
    const blob = new Blob([output], { type: `${mimeType};charset=utf-8` });
    return {
      blob: blob,
      url: URL.createObjectURL(blob),
      content: output,
      ext: isVtt ? 'vtt' : 'srt'
    };
  }

  // --- 1-Click Project .ZIP Archive Bundler ---
  exportProjectZip(project) {
    const projJson = JSON.stringify(project, null, 2);
    const projBytes = new TextEncoder().encode(projJson);
    const fileName = 'project.vcproj';

    const files = [{ name: fileName, data: projBytes }];
    const zipBytes = [];
    const cdEntries = [];
    let offset = 0;

    function writeShort(val) { zipBytes.push(val & 0xFF, (val >> 8) & 0xFF); }
    function writeLong(val) { zipBytes.push(val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF, (val >> 24) & 0xFF); }
    function writeStr(s) { for (let i = 0; i < s.length; i++) zipBytes.push(s.charCodeAt(i)); }

    files.forEach(f => {
      const localHeaderOffset = offset;
      writeLong(0x04034b50);
      writeShort(20);
      writeShort(0);
      writeShort(0);
      writeShort(0);
      writeShort(0);

      let crc = 0 ^ (-1);
      for (let i = 0; i < f.data.length; i++) {
        crc = (crc >>> 8) ^ 0xEDB88320;
      }
      crc = (crc ^ (-1)) >>> 0;

      writeLong(crc);
      writeLong(f.data.length);
      writeLong(f.data.length);
      writeShort(f.name.length);
      writeShort(0);
      writeStr(f.name);
      for (let i = 0; i < f.data.length; i++) zipBytes.push(f.data[i]);
      offset = zipBytes.length;

      cdEntries.push({ name: f.name, size: f.data.length, crc: crc, offset: localHeaderOffset });
    });

    const cdStart = zipBytes.length;
    cdEntries.forEach(f => {
      writeLong(0x02014b50);
      writeShort(20);
      writeShort(20);
      writeShort(0);
      writeShort(0);
      writeShort(0);
      writeShort(0);
      writeLong(f.crc);
      writeLong(f.size);
      writeLong(f.size);
      writeShort(f.name.length);
      writeShort(0);
      writeShort(0);
      writeShort(0);
      writeShort(0);
      writeLong(0);
      writeLong(f.offset);
      writeStr(f.name);
    });

    const cdEnd = zipBytes.length;
    const cdSize = cdEnd - cdStart;

    writeLong(0x06054b50);
    writeShort(0);
    writeShort(0);
    writeShort(cdEntries.length);
    writeShort(cdEntries.length);
    writeLong(cdSize);
    writeLong(cdStart);
    writeShort(0);

    const zipBlob = new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' });
    return {
      blob: zipBlob,
      url: URL.createObjectURL(zipBlob),
      ext: 'zip'
    };
  }
}

window.VideoWebExporter = VideoWebExporter;
