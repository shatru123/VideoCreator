class VideoWebExporter {
  constructor(engine) {
    this.engine = engine;
  }

  async exportVideo(project, options, onProgress) {
    const { width, height } = project.canvas;
    const fps = options.fps || 30;
    const totalDuration = project.timeline.totalDuration || 5.0;
    const totalFrames = Math.ceil(totalDuration * fps);

    // Create offscreen export canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportEngine = new VideoCanvasEngine(exportCanvas);

    // Preload all clip images into export engine
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        await exportEngine.loadImage(clip.source);
      }
    }

    // Determine universal supported mime type (H.264 / AAC preferred for universal playback)
    const mimeTypes = [
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4',
      'video/webm; codecs=vp9,opus',
      'video/webm; codecs=vp8,opus',
      'video/webm'
    ];

    let selectedMime = 'video/webm';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    const stream = exportCanvas.captureStream(fps);

    // Audio Muxing
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
          const srcNode = actx.createMediaElementSource(audioElem);
          srcNode.connect(dest);

          dest.stream.getAudioTracks().forEach(track => {
            stream.addTrack(track);
          });
        }
      } catch (e) {
        console.warn('Audio capture stream fallback:', e);
      }
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: options.bitrate || 8000000
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        if (audioElem) audioElem.pause();
        if (actx) actx.close();

        const isMp4 = selectedMime.includes('mp4');
        const ext = isMp4 ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: selectedMime });
        const url = URL.createObjectURL(blob);
        resolve({ url, ext, blob });
      };

      mediaRecorder.onerror = (err) => reject(err);

      mediaRecorder.start();
      if (audioElem) {
        audioElem.currentTime = 0;
        audioElem.play().catch(() => {});
      }

      let currentFrame = 0;
      const frameInterval = 1000 / fps;

      const renderNextFrame = () => {
        if (currentFrame >= totalFrames) {
          setTimeout(() => mediaRecorder.stop(), 200);
          return;
        }

        const timestamp = currentFrame / fps;
        exportEngine.render(project, timestamp);

        currentFrame++;
        const pct = Math.round((currentFrame / totalFrames) * 100);
        if (onProgress) {
          onProgress({ currentFrame, totalFrames, percentage: pct });
        }

        setTimeout(renderNextFrame, frameInterval * 0.5);
      };

      renderNextFrame();
    });
  }
}

window.VideoWebExporter = VideoWebExporter;
