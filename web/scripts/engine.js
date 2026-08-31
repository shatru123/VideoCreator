class VideoCanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.imageCache = new Map(); // url -> Image
    this.blurCache = new Map();  // url -> offscreen Canvas (fast blurred bg)
    this.lastRenderKey = '';
  }

  loadImage(src) {
    if (this.imageCache.has(src)) return Promise.resolve(this.imageCache.get(src));
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(src, img);
        this.createPreBlurredBackground(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Pre-renders a small offscreen blurred canvas once per image (100x faster than real-time CSS filter)
  createPreBlurredBackground(src, img) {
    try {
      const off = document.createElement('canvas');
      off.width = 160;
      off.height = 90;
      const oCtx = off.getContext('2d');
      if (oCtx) {
        oCtx.filter = 'blur(8px) brightness(0.6)';
        oCtx.drawImage(img, 0, 0, 160, 90);
        this.blurCache.set(src, off);
      }
    } catch (e) {
      // Fallback silently if canvas context fails
    }
  }

  render(project, timestamp) {
    const { width, height } = project.canvas;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const ctx = this.ctx;
    ctx.fillStyle = project.canvas.backgroundColor || '#000000';
    ctx.fillRect(0, 0, width, height);

    // 1. Render Video / Photo Track
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video' && !t.isMuted);
    if (videoTrack) {
      this.renderVideoTrack(ctx, videoTrack, timestamp, width, height);
    }

    // 2. Render Overlay / Text Track
    const overlayTrack = project.timeline.tracks.find(t => t.type === 'overlay' && !t.isMuted);
    if (overlayTrack) {
      this.renderOverlayTrack(ctx, overlayTrack, timestamp, width, height);
    }

    // 3. Render Global Vignette if enabled
    const effectTrack = project.timeline.tracks.find(t => t.type === 'effect' && !t.isMuted);
    if (effectTrack) {
      this.renderVignette(ctx, width, height, 0.35);
    }
  }

  renderVideoTrack(ctx, track, timestamp, width, height) {
    const clips = track.clips;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (timestamp >= clip.startTime && timestamp < clip.startTime + clip.duration) {
        const localTime = timestamp - clip.startTime;

        // Transition Out
        if (clip.transitionOut && clip.transitionOut.type !== 'None' && i + 1 < clips.length) {
          const nextClip = clips[i + 1];
          const transDur = clip.transitionOut.duration || 0.6;
          const transStartTime = clip.duration - transDur;

          if (localTime >= transStartTime && transDur > 0) {
            const progress = (localTime - transStartTime) / transDur;
            this.renderTransition(ctx, clip, nextClip, localTime, clip.transitionOut, progress, width, height);
            return;
          }
        }

        this.renderSingleClip(ctx, clip, localTime, width, height);
        return;
      }
    }
  }

  renderSingleClip(ctx, clip, localTime, width, height) {
    const img = this.imageCache.get(clip.source);
    if (!img) return;

    const progress = Math.min(1.0, Math.max(0.0, localTime / clip.duration));
    const easeT = this.easeInOut(progress);

    ctx.save();

    // 1. Fast Blurred Background from Pre-computed Cache
    if (clip.cropMode === 'BlurBackground') {
      const blurred = this.blurCache.get(clip.source);
      if (blurred) {
        ctx.drawImage(blurred, 0, 0, width, height);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, width, height);
      }
    }

    // 2. Compute Ken Burns Camera Trajectory
    let scale = Math.max(width / img.width, height / img.height);
    let transX = 0, transY = 0;
    const maxPanX = Math.max(20, (img.width * scale - width) * 0.5);
    const maxPanY = Math.max(20, (img.height * scale - height) * 0.5);

    switch (clip.motion) {
      case 'ZoomIn':
        scale *= (1.0 + 0.16 * easeT);
        break;
      case 'ZoomOut':
        scale *= (1.16 - 0.16 * easeT);
        break;
      case 'ZoomInOut': {
        const zProg = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        const zEase = this.easeInOut(zProg);
        scale *= (1.0 + 0.15 * zEase);
        break;
      }
      case 'SlowZoomIn':
        scale *= (1.0 + 0.07 * easeT);
        break;
      case 'SlowZoomOut':
        scale *= (1.07 - 0.07 * easeT);
        break;
      case 'DynamicZoom': {
        const pulse = Math.sin(progress * Math.PI * 2) * 0.08;
        scale *= (1.08 + pulse);
        break;
      }
      case 'PanLeft':
      case 'PanRightToLeft':
        scale *= 1.12;
        transX = maxPanX * (1 - 2 * easeT);
        break;
      case 'PanRight':
      case 'PanLeftToRight':
        scale *= 1.12;
        transX = -maxPanX * (1 - 2 * easeT);
        break;
      case 'PanUp':
      case 'PanBottomToTop':
        scale *= 1.12;
        transY = maxPanY * (1 - 2 * easeT);
        break;
      case 'PanDown':
      case 'PanTopToBottom':
        scale *= 1.12;
        transY = -maxPanY * (1 - 2 * easeT);
        break;
      case 'KenBurns':
        scale *= (1.0 + 0.18 * easeT);
        transX = -maxPanX * 0.7 * (1 - 2 * easeT);
        transY = -maxPanY * 0.7 * (1 - 2 * easeT);
        break;
      case 'DiagonalUpLeft':
        scale *= (1.04 + 0.10 * easeT);
        transX = maxPanX * 0.6 * (1 - 2 * easeT);
        transY = maxPanY * 0.6 * (1 - 2 * easeT);
        break;
      case 'DiagonalDownRight':
      case 'Diagonal':
        scale *= (1.04 + 0.10 * easeT);
        transX = -maxPanX * 0.6 * (1 - 2 * easeT);
        transY = -maxPanY * 0.6 * (1 - 2 * easeT);
        break;
      case 'Cinematic':
        scale *= (1.0 + 0.09 * easeT);
        transX = -maxPanX * 0.35 * (1 - 2 * easeT);
        break;
      case 'RandomMotion':
      case 'Random': {
        const isWide = (img.width / img.height) > (width / height);
        if (isWide) {
          scale *= (1.02 + 0.10 * easeT);
          transX = -maxPanX * 0.5 * (1 - 2 * easeT);
        } else {
          scale *= (1.12 - 0.10 * easeT);
          transY = maxPanY * 0.5 * (1 - 2 * easeT);
        }
        break;
      }
      default:
        // Static
        break;
    }

    // 3. User Custom Transform (Rotation, Flip, Scale, Opacity)
    const tf = clip.transform || {};
    const customScale = tf.scaleX || 1.0;
    scale *= customScale;
    transX += (tf.positionX || 0);
    transY += (tf.positionY || 0);

    if (tf.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, tf.opacity));
    }

    // 4. Color Grading Filters & Cinematic LUTs
    let filterString = '';
    const preset = clip.filterPreset || 'none';

    if (preset === 'cinematic') {
      filterString = 'contrast(1.15) saturate(1.1) brightness(0.95)';
    } else if (preset === 'teal-orange') {
      filterString = 'contrast(1.25) saturate(1.3) sepia(0.2) hue-rotate(185deg)';
    } else if (preset === 'sunset') {
      filterString = 'sepia(0.35) saturate(1.4) brightness(1.05) contrast(1.1)';
    } else if (preset === 'vintage') {
      filterString = 'sepia(0.55) contrast(0.9) brightness(0.95) saturate(0.85)';
    } else if (preset === 'noir') {
      filterString = 'grayscale(1) contrast(1.35) brightness(0.9)';
    } else if (preset === 'vibrant') {
      filterString = 'saturate(1.5) contrast(1.15) brightness(1.02)';
    } else if (preset === 'cyberpunk') {
      filterString = 'contrast(1.3) saturate(1.4) hue-rotate(290deg)';
    } else if (preset === 'pastel') {
      filterString = 'brightness(1.1) saturate(0.8) contrast(0.95)';
    }

    const cg = clip.colorGrading;
    if (cg) {
      const exp = 1 + (cg.exposure || 0) * 0.3;
      const cnt = (cg.contrast !== undefined ? cg.contrast : 50) / 50;
      const sat = (cg.saturation !== undefined ? cg.saturation : 100) / 100;
      filterString += ` brightness(${exp}) contrast(${cnt}) saturate(${sat})`;
    }

    if (filterString.trim()) {
      ctx.filter = filterString.trim();
    }

    // Center pivot & Render image
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const centerX = width * 0.5 + transX;
    const centerY = height * 0.5 + transY;

    ctx.translate(centerX, centerY);

    if (tf.rotationDegrees) {
      ctx.rotate((tf.rotationDegrees * Math.PI) / 180);
    }
    if (tf.flipX || tf.flipY) {
      ctx.scale(tf.flipX ? -1 : 1, tf.flipY ? -1 : 1);
    }

    ctx.drawImage(img, -drawW * 0.5, -drawH * 0.5, drawW, drawH);

    ctx.restore();
  }

  renderTransition(ctx, clipA, clipB, localTime, transition, progress, width, height) {
    const p = Math.min(1.0, Math.max(0.0, progress));
    const easeP = this.easeInOut(p);

    switch (transition.type) {
      case 'Fade':
      case 'CrossDissolve':
      case 'Dissolve': {
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.save();
        ctx.globalAlpha = easeP;
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;
      }
      case 'SlideLeft': {
        ctx.save();
        ctx.translate(-width * easeP, 0);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        ctx.save();
        ctx.translate(width * (1 - easeP), 0);
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;
      }
      case 'SlideRight': {
        ctx.save();
        ctx.translate(width * easeP, 0);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        ctx.save();
        ctx.translate(-width * (1 - easeP), 0);
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;
      }
      case 'WipeLeft': {
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(width * (1 - easeP), 0, width * easeP, height);
        ctx.clip();
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;
      }
      case 'Flash': {
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        const flashAlpha = p < 0.5 ? p * 2 : (1 - p) * 2;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.9})`;
        ctx.fillRect(0, 0, width, height);
        if (p >= 0.5) {
          ctx.save();
          ctx.globalAlpha = (p - 0.5) * 2;
          this.renderSingleClip(ctx, clipB, 0, width, height);
          ctx.restore();
        }
        break;
      }
      default:
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        break;
    }
  }

  renderOverlayTrack(ctx, track, timestamp, width, height) {
    track.clips.forEach(clip => {
      if (timestamp >= clip.startTime && timestamp < clip.startTime + clip.duration) {
        const localTime = timestamp - clip.startTime;
        this.renderTextClip(ctx, clip, localTime, width, height);
      }
    });
  }

  renderTextClip(ctx, clip, localTime, width, height) {
    if (!clip.overlay) return;
    const ov = clip.overlay;

    ctx.save();

    let alpha = 1.0;
    let offsetY = 0;
    let scale = 1.0;

    const animDur = ov.animationDuration || 0.6;
    if (localTime < animDur) {
      const p = localTime / animDur;
      const easeP = this.easeInOut(p);

      switch (ov.entryAnimation) {
        case 'Fade':
          alpha = easeP;
          break;
        case 'Slide':
        case 'SlideUp':
          alpha = easeP;
          offsetY = 40 * (1 - easeP);
          break;
        case 'Pop':
          scale = 0.5 + 0.5 * easeP;
          alpha = easeP;
          break;
      }
    }

    ctx.globalAlpha = alpha;

    const fontSize = Math.round((ov.fontSize || 54) * (width / 1920));
    ctx.font = `italic 900 ${fontSize}px "${ov.fontFamily || 'Inter'}", -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = width * (clip.transform?.anchorX || 0.5);
    const y = height * (clip.transform?.anchorY || 0.5) + offsetY;

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const lines = (ov.text || '').split('\n');
    const lineHeight = fontSize * 1.25;
    const totalTextH = lines.length * lineHeight;
    let startY = -totalTextH * 0.5 + lineHeight * 0.5;

    // Draw high-contrast drop shadow & outline for ultra-crisp typography
    lines.forEach(line => {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 4;

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.lineWidth = Math.max(3, fontSize * 0.08);
      ctx.strokeText(line, 0, startY);

      ctx.fillStyle = ov.colorHex || '#FFFFFF';
      ctx.fillText(line, 0, startY);

      startY += lineHeight;
    });

    ctx.restore();
  }

  renderVignette(ctx, width, height, intensity = 0.3) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width * 0.5, height * 0.5, width * 0.35,
      width * 0.5, height * 0.5, width * 0.75
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}
