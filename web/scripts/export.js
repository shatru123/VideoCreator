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

    // Determine supported mime type
    let mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm; codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    const stream = exportCanvas.captureStream(fps);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: options.bitrate || 6000000
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const isMp4 = mimeType.includes('mp4');
        const ext = isMp4 ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        resolve({ url, ext, blob });
      };

      mediaRecorder.onerror = (err) => reject(err);

      mediaRecorder.start();

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
