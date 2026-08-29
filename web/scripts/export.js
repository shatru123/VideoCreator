class VideoWebExporter {
  constructor(engine) {
    this.engine = engine;
  }

  async exportVideo(project, options, onProgress) {
    const { width, height } = project.canvas;
    const fps = options.fps || 30;
    const totalDuration = project.timeline.totalDuration || 5.0;

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

    // Determine the optimal universally supported MIME type
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
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    if (!selectedMime) selectedMime = 'video/webm';

    // Capture Canvas Stream at standard 30fps
    const stream = exportCanvas.captureStream(fps);

    // Setup Web Audio Stream Destination for synchronized audio
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
      mediaRecorder.start(250); // Request chunks every 250ms for reliable streaming buffers
      if (audioElem) {
        audioElem.currentTime = 0;
        audioElem.play().catch(() => {});
      }

      const startWallClock = performance.now();

      function renderLoop() {
        const elapsedSec = (performance.now() - startWallClock) / 1000;
        const currentTimestamp = Math.min(totalDuration, elapsedSec);

        exportEngine.render(project, currentTimestamp);

        const pct = Math.min(100, Math.round((currentTimestamp / totalDuration) * 100));
        if (onProgress) {
          onProgress({
            percentage: pct,
            currentTime: currentTimestamp.toFixed(1),
            totalDuration: totalDuration.toFixed(1)
          });
        }

        if (elapsedSec >= totalDuration) {
          // Finished rendering timeline
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
          }, 300);
          return;
        }

        requestAnimationFrame(renderLoop);
      }

      requestAnimationFrame(renderLoop);
    });
  }
}

window.VideoWebExporter = VideoWebExporter;
