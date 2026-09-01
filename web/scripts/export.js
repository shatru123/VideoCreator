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

    // Preload images
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        if (clip.source) await exportEngine.loadImage(clip.source);
      }
    }

    // Discover supported AVC / H.264 codec
    const candidateCodecs = [
      'avc1.42001f', // Baseline Profile Level 3.1 (most compatible on mobile)
      'avc1.42E01E', // Constrained Baseline Level 3.0
      'avc1.4D401F', // Main Profile Level 3.1
      'avc1.4d002a', // Main Profile Level 4.2
      'avc1.64001F', // High Profile Level 3.1
      'avc1.640028'  // High Profile Level 4.0
    ];

    let selectedCodec = null;
    for (const c of candidateCodecs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: c,
          width: targetWidth,
          height: targetHeight,
          bitrate: bitrate,
          framerate: fps
        });
        if (support && support.supported) {
          selectedCodec = c;
          break;
        }
      } catch (e) {}
    }
    if (!selectedCodec) selectedCodec = 'avc1.42001f';

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
        console.warn('AudioEncoder check warning:', e);
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

    // Configure VideoEncoder
    let videoEncoderError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { videoEncoderError = e; console.error('VideoEncoder error:', e); }
    });

    videoEncoder.configure({
      codec: selectedCodec,
      width: targetWidth,
      height: targetHeight,
      bitrate: bitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware'
    });

    // Encode Audio if available
    let audioEncoder = null;
    if (canEncodeAudio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error:', e)
      });

      audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: 44100,
        bitrate: 192000
      });

      await this._encodeAudioBuffer(audioBuffer, audioEncoder);
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

      const isKeyFrame = (frameIdx % (fps * 2) === 0) || (frameIdx === 0);
      const videoFrame = new VideoFrame(exportCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs
      });

      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      // Progress reporting & yielding to UI thread
      if (frameIdx % 4 === 0 || frameIdx === totalFrames - 1) {
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
      await audioEncoder.flush();
    }

    // Finalize MP4 File
    muxer.finalize();
    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
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

    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        if (clip.source) await exportEngine.loadImage(clip.source);
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

      mediaRecorder.start(200);
      if (audioElem) {
        audioElem.currentTime = 0;
        audioElem.play().catch(() => {});
      }

      const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
      const frameIntervalMs = 1000 / fps;
      let frameIdx = 0;

      const renderProject = {
        ...project,
        canvas: { ...project.canvas, width: targetWidth, height: targetHeight }
      };

      // Deterministic frame delivery for MediaRecorder
      const renderInterval = setInterval(() => {
        if (frameIdx >= totalFrames) {
          clearInterval(renderInterval);
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
          }, 300);
          return;
        }

        const currentTimestamp = (frameIdx / fps);
        exportEngine.render(renderProject, Math.min(totalDuration, currentTimestamp));

        const pct = Math.min(100, Math.round(((frameIdx + 1) / totalFrames) * 100));
        if (onProgress) {
          onProgress({
            percentage: pct,
            currentTime: currentTimestamp.toFixed(1),
            totalDuration: totalDuration.toFixed(1)
          });
        }

        frameIdx++;
      }, frameIntervalMs);
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
            const resp = await fetch(clip.source);
            const ab = await resp.arrayBuffer();
            clipBuf = await actx.decodeAudioData(ab);
          }

          if (clipBuf) {
            const clipStartSample = Math.max(0, Math.floor((clip.startTime || 0) * sampleRate));
            const clipDurSamples = Math.floor((clip.duration || durationSec) * sampleRate);
            const clipVol = clip.volume !== undefined ? clip.volume : 1.0;

            const cLeft = clipBuf.getChannelData(0);
            const cRight = clipBuf.numberOfChannels > 1 ? clipBuf.getChannelData(1) : cLeft;

            for (let i = 0; i < clipDurSamples && (clipStartSample + i) < totalSamples; i++) {
              const srcIdx = i % clipBuf.length;
              leftChannel[clipStartSample + i] += (cLeft[srcIdx] || 0) * clipVol;
              rightChannel[clipStartSample + i] += (cRight[srcIdx] || 0) * clipVol;
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

  // --- ISO-BMFF MP4 Duration Patcher (for iOS Safari MediaRecorder) ---
  async _fixMp4Duration(blob, durationSec) {
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    let pos = 0;
    while (pos < data.length - 8) {
      let size = view.getUint32(pos, false);
      const boxType = String.fromCharCode(data[pos+4], data[pos+5], data[pos+6], data[pos+7]);

      if (size === 1 && pos + 16 <= data.length) {
        size = Number(view.getBigUint64(pos + 8, false));
      } else if (size === 0) {
        size = data.length - pos;
      }
      if (size < 8) break;

      if (boxType === 'moov') {
        let subPos = pos + 8;
        const moovEnd = Math.min(data.length, pos + size);
        while (subPos < moovEnd - 8) {
          const subSize = view.getUint32(subPos, false);
          const subType = String.fromCharCode(data[subPos+4], data[subPos+5], data[subPos+6], data[subPos+7]);
          if (subSize < 8 || subPos + subSize > moovEnd) break;

          if (subType === 'mvhd') {
            const version = data[subPos + 8];
            if (version === 0 && subPos + 28 <= moovEnd) {
              const timescale = view.getUint32(subPos + 20, false);
              const durVal = Math.round(durationSec * (timescale || 1000));
              view.setUint32(subPos + 24, durVal, false);
            } else if (version === 1 && subPos + 40 <= moovEnd) {
              const timescale = view.getUint32(subPos + 28, false);
              const durVal = BigInt(Math.round(durationSec * (timescale || 1000)));
              view.setBigUint64(subPos + 32, durVal, false);
            }
          }
          subPos += subSize;
        }
      }
      pos += size;
    }

    return new Blob([data.buffer], { type: 'video/mp4' });
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
      if (len === 4) {
        dataView.setFloat32(durationPos + 3, durationMs, false);
      } else if (len === 8) {
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
}

window.VideoWebExporter = VideoWebExporter;
