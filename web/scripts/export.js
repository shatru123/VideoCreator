class VideoWebExporter {
  constructor(engine) {
    this.engine = engine;
  }

  async exportVideo(project, options = {}, onProgress) {
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
      if (isSquare) { targetWidth = 1080; targetHeight = 1080; }
      else if (isPortrait) { targetWidth = 1080; targetHeight = 1920; }
      else { targetWidth = 1920; targetHeight = 1080; }
    } else if (res === '720') {
      if (isSquare) { targetWidth = 720; targetHeight = 720; }
      else if (isPortrait) { targetWidth = 720; targetHeight = 1280; }
      else { targetWidth = 1280; targetHeight = 720; }
    } else if (res === '480') {
      if (isSquare) { targetWidth = 480; targetHeight = 480; }
      else if (isPortrait) { targetWidth = 480; targetHeight = 854; }
      else { targetWidth = 854; targetHeight = 480; }
    }

    const fps = parseInt(options.fps) || 30;
    const totalDuration = project.timeline.totalDuration || 5.0;

    // Create offscreen export canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportEngine = new VideoCanvasEngine(exportCanvas);

    // Preload all clip images into export engine
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        await exportEngine.loadImage(clip.source);
      }
    }

    // Determine candidate MIME type
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

    // Capture Canvas Stream at requested FPS
    const stream = exportCanvas.captureStream(fps);

    // Setup Web Audio Stream Destination for synchronized audio tracks
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

          dest.stream.getAudioTracks().forEach(track => {
            stream.addTrack(track);
          });
        }
      } catch (e) {
        console.warn('Audio capture fallback:', e);
      }
    }

    const defaultBitrate = res === '4k' ? 24000000 : (res === '1080' ? 10000000 : 5000000);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: options.bitrate || defaultBitrate
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        if (audioElem) {
          audioElem.pause();
          audioElem = null;
        }
        if (actx) {
          actx.close();
          actx = null;
        }

        const isMp4 = selectedMime.toLowerCase().includes('mp4');
        const ext = isMp4 ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: selectedMime });
        const url = URL.createObjectURL(blob);
        resolve({ url, ext, blob, isMp4 });
      };

      mediaRecorder.onerror = (err) => reject(err);

      // Start recording
      mediaRecorder.start(250);
      if (audioElem) {
        audioElem.currentTime = 0;
        audioElem.play().catch(() => {});
      }

      const startWallClock = performance.now();

      function renderLoop() {
        const elapsedSec = (performance.now() - startWallClock) / 1000;
        const currentTimestamp = Math.min(totalDuration, elapsedSec);

        // Render project state
        const renderProject = {
          ...project,
          canvas: { ...project.canvas, width: targetWidth, height: targetHeight }
        };
        exportEngine.render(renderProject, currentTimestamp);

        const pct = Math.min(100, Math.round((currentTimestamp / totalDuration) * 100));
        if (onProgress) {
          onProgress({
            percentage: pct,
            currentTime: currentTimestamp.toFixed(1),
            totalDuration: totalDuration.toFixed(1)
          });
        }

        if (elapsedSec >= totalDuration) {
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
          }, 350);
          return;
        }

        requestAnimationFrame(renderLoop);
      }

      requestAnimationFrame(renderLoop);
    });
  }
}

window.VideoWebExporter = VideoWebExporter;
