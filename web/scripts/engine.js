class VideoCanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.imageCache = new Map(); // url -> Image
    this.bgCanvas = document.createElement('canvas');
    this.bgCtx = this.bgCanvas.getContext('2d');
  }

  loadImage(src) {
    if (this.imageCache.has(src)) return Promise.resolve(this.imageCache.get(src));
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
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

    // 3. Render Global Vignette
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

    // 1. Smart Crop: Blur Background
    if (clip.cropMode === 'BlurBackground') {
      ctx.save();
      ctx.filter = 'blur(20px) brightness(0.7)';
      ctx.drawImage(img, -20, -20, width + 40, height + 40);
      ctx.restore();
    }

    // 2. Compute Ken Burns Motion
    let scale = Math.max(width / img.width, height / img.height);
    let transX = 0, transY = 0;
    const maxPanX = Math.max(30, (img.width * scale - width) * 0.5);
    const maxPanY = Math.max(30, (img.height * scale - height) * 0.5);

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
        scale *= (1.0 + 0.06 * easeT);
        break;
      case 'SlowZoomOut':
        scale *= (1.06 - 0.06 * easeT);
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
    }

    // 3. Apply User Custom Transforms (Rotation, Flip, Scale, Pan, Opacity)
    const tf = clip.transform || {};
    const customScale = tf.scaleX || 1.0;
    scale *= customScale;
    transX += (tf.positionX || 0);
    transY += (tf.positionY || 0);

    if (tf.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, tf.opacity));
    }

    // Color Filters
    let filters = [];
    if (clip.effects && clip.effects.length > 0) {
      for (const eff of clip.effects) {
        if (eff.type === 'Brightness') filters.push(`brightness(${1 + eff.intensity * 0.5})`);
        if (eff.type === 'Contrast') filters.push(`contrast(${1 + eff.intensity * 0.6})`);
        if (eff.type === 'Saturation') filters.push(`saturate(${1 + eff.intensity * 0.7})`);
        if (eff.type === 'Vintage') filters.push(`sepia(${eff.intensity * 0.6})`);
        if (eff.type === 'Grayscale') filters.push(`grayscale(${eff.intensity})`);
        if (eff.type === 'Blur') filters.push(`blur(${eff.intensity * 8}px)`);
        if (eff.type === 'Glow') filters.push(`drop-shadow(0 0 ${eff.intensity * 15}px rgba(255,230,150,0.5))`);
        if (eff.type === 'Cinematic') filters.push(`contrast(1.1) saturate(1.15)`);
      }
    }
    if (filters.length > 0) {
      ctx.filter = filters.join(' ');
    }

    // Matrix translation & rotation around center
    ctx.translate(width * 0.5 + transX, height * 0.5 + transY);

    if (tf.flipX || tf.flipY) {
      ctx.scale(tf.flipX ? -1 : 1, tf.flipY ? -1 : 1);
    }

    if (tf.rotationDegrees) {
      ctx.rotate((tf.rotationDegrees * Math.PI) / 180.0);
    }

    const drawW = img.width * scale;
    const drawH = img.height * scale;

    ctx.drawImage(img, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
    ctx.restore();
  }

  renderTransition(ctx, clipA, clipB, localTime, trans, progress, width, height) {
    const easeP = this.easeInOut(progress);

    switch (trans.type) {
      case 'CrossDissolve':
      case 'Fade':
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.save();
        ctx.globalAlpha = easeP;
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;

      case 'SlideLeft':
      case 'Push':
        ctx.save();
        ctx.translate(-width * easeP, 0);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        ctx.save();
        ctx.translate(width * (1 - easeP), 0);
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;

      case 'SlideUp':
        ctx.save();
        ctx.translate(0, -height * easeP);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        ctx.save();
        ctx.translate(0, height * (1 - easeP));
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;

      case 'Zoom':
        ctx.save();
        ctx.globalAlpha = 1 - easeP;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(1 + easeP * 0.4, 1 + easeP * 0.4);
        ctx.translate(-width * 0.5, -height * 0.5);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = easeP;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(0.8 + easeP * 0.2, 0.8 + easeP * 0.2);
        ctx.translate(-width * 0.5, -height * 0.5);
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;

      default:
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        break;
    }
  }

  renderOverlayTrack(ctx, track, timestamp, width, height) {
    for (const clip of track.clips) {
      if (timestamp >= clip.startTime && timestamp < clip.startTime + clip.duration) {
        const localTime = timestamp - clip.startTime;
        this.renderTextOverlay(ctx, clip, localTime, width, height);
      }
    }
  }

  renderTextOverlay(ctx, clip, localTime, width, height) {
    const overlay = clip.overlay || {};
    const text = overlay.text || 'Title';
    const fontSize = overlay.fontSize || 48;
    const fontFamily = overlay.fontFamily || 'Inter, sans-serif';
    const color = overlay.colorHex || '#FFFFFF';
    const bgColor = overlay.backgroundColorHex || 'rgba(0,0,0,0.6)';
    const anim = overlay.entryAnimation || 'Slide';
    const animDur = overlay.animationDuration || 0.6;

    let animOpacity = 1.0;
    let animOffsetY = 0;
    let animScale = 1.0;
    let displayText = text;

    if (localTime < animDur && animDur > 0) {
      const t = localTime / animDur;
      const ease = this.easeOut(t);
      if (anim === 'Fade') animOpacity = ease;
      if (anim === 'Slide') { animOffsetY = (1 - ease) * 40; animOpacity = ease; }
      if (anim === 'Pop' || anim === 'Zoom') { animScale = 0.6 + 0.4 * ease; animOpacity = ease; }
      if (anim === 'Typewriter') {
        const count = Math.max(1, Math.floor(text.length * ease));
        displayText = text.substring(0, count);
      }
    }

    ctx.save();
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const posX = width * (clip.transform?.anchorX || 0.5);
    const posY = height * (clip.transform?.anchorY || 0.85) + animOffsetY;

    ctx.translate(posX, posY);
    ctx.scale(animScale, animScale);
    ctx.globalAlpha = animOpacity;

    const metrics = ctx.measureText(displayText);
    const textW = metrics.width;
    const textH = fontSize * 1.2;

    // Draw Background Pill
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      const padX = 20, padY = 10, radius = 10;
      const rx = -textW * 0.5 - padX;
      const ry = -textH * 0.5 - padY;
      const rw = textW + padX * 2;
      const rh = textH + padY * 2;

      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, radius);
      ctx.fill();
    }

    // Shadow & Text
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = color;
    ctx.fillText(displayText, 0, 0);

    ctx.restore();
  }

  renderVignette(ctx, width, height, intensity = 0.35) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width * 0.5, height * 0.5, Math.min(width, height) * 0.3,
      width * 0.5, height * 0.5, Math.max(width, height) * 0.75
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}

window.VideoCanvasEngine = VideoCanvasEngine;
