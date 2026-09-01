class VideoCanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.imageCache = new Map(); // url -> Image
    this.blurCache = new Map();  // url -> offscreen Canvas (fast blurred bg)
  }

  loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (this.imageCache.has(src)) {
      const cached = this.imageCache.get(src);
      // Verify cached image is truly usable (fully loaded, not broken)
      if (cached && cached.naturalWidth > 0 && cached.complete) {
        return Promise.resolve(cached);
      }
      // Cached but broken/incomplete — remove and reload
      this.imageCache.delete(src);
    }
    return new Promise((resolve) => {
      const img = new Image();
      // Only set crossOrigin for remote HTTP URLs.
      // Setting crossOrigin on blob: or data: URLs causes CORS errors on iOS Safari & mobile WebKit.
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (img.naturalWidth > 0) {
          this.imageCache.set(src, img);
          this.createPreBlurredBackground(src, img);
          resolve(img);
        } else {
          console.warn('[VideoCanvasEngine] Image loaded with 0 dimensions:', src);
          resolve(null);
        }
      };
      img.onerror = (err) => {
        console.warn('[VideoCanvasEngine] Image load failed for:', src);
        resolve(null);
      };
      img.src = src;
    });
  }

  // Pre-renders a small offscreen blurred canvas once per image (100x faster than real-time CSS filter)
  createPreBlurredBackground(src, img) {
    if (!img) return;
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

    // 2. Render Overlay / Text Track & Stickers
    const overlayTrack = project.timeline.tracks.find(t => t.type === 'overlay' && !t.isMuted);
    if (overlayTrack) {
      this.renderOverlayTrack(ctx, overlayTrack, timestamp, width, height);
    }

    // 3. Render Atmospheric Particle Effects if enabled
    if (project.particleEffect && project.particleEffect !== 'none') {
      this.renderParticleEffects(ctx, width, height, project.particleEffect, timestamp);
    }

    // 4. Render Global Vignette if enabled
    const effectTrack = project.timeline.tracks.find(t => t.type === 'effect' && !t.isMuted);
    if (effectTrack || project.vignette) {
      const intensity = project.vignette !== undefined ? project.vignette : 0.35;
      if (intensity > 0) {
        this.renderVignette(ctx, width, height, intensity);
      }
    }

    // 5. Render Platform Safe-Zone Guide Overlay if active (Reels, TikTok, Shorts)
    if (project.safeZone && project.safeZone !== 'none') {
      this.renderSafeZones(ctx, width, height, project.safeZone);
    }
  }

  renderVideoTrack(ctx, track, timestamp, width, height) {
    const clips = track.clips;
    if (!clips || clips.length === 0) return;

    // Find the active clip for timestamp
    let activeClipIdx = -1;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const end = clip.startTime + clip.duration;
      if (timestamp >= clip.startTime && (i === clips.length - 1 ? timestamp <= end : timestamp < end)) {
        activeClipIdx = i;
        break;
      }
    }

    // Boundary fallback (e.g. at or beyond the exact end of timeline)
    if (activeClipIdx === -1) {
      if (timestamp >= clips[clips.length - 1].startTime) {
        activeClipIdx = clips.length - 1;
      } else {
        activeClipIdx = 0;
      }
    }

    const clip = clips[activeClipIdx];
    const localTime = Math.max(0, timestamp - clip.startTime);

    // Transition Out
    if (clip.transitionOut && clip.transitionOut.type !== 'None' && activeClipIdx + 1 < clips.length) {
      const nextClip = clips[activeClipIdx + 1];
      const transDur = clip.transitionOut.duration || 0.6;
      const transStartTime = Math.max(0, clip.duration - transDur);

      if (localTime >= transStartTime && transDur > 0) {
        const progress = Math.min(1.0, (localTime - transStartTime) / transDur);
        this.renderTransition(ctx, clip, nextClip, localTime, clip.transitionOut, progress, width, height);
        return;
      }
    }

    this.renderSingleClip(ctx, clip, localTime, width, height);
  }

  renderSingleClip(ctx, clip, localTime, width, height) {
    const img = this.imageCache.get(clip.source);
    if (!img) {
      if (clip.source) this.loadImage(clip.source);
      return;
    }

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

      if (cg.temperature) {
        const warm = cg.temperature > 0 ? `sepia(${cg.temperature * 0.3})` : `hue-rotate(${cg.temperature * 0.2}deg)`;
        filterString += ` ${warm}`;
      }
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
      case 'Glitch': {
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        if (p > 0.05 && p < 0.95) {
          const sliceCount = 6;
          for (let s = 0; s < sliceCount; s++) {
            const sy = Math.random() * height;
            const sh = Math.max(10, Math.random() * (height * 0.12));
            const dx = (Math.random() - 0.5) * width * 0.12;
            ctx.drawImage(this.canvas, 0, sy, width, sh, dx, sy, width, sh);
          }
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = `rgba(239, 68, 68, ${Math.random() * 0.35})`;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
        if (p >= 0.45) {
          ctx.save();
          ctx.globalAlpha = Math.min(1.0, (p - 0.45) * 1.8);
          this.renderSingleClip(ctx, clipB, 0, width, height);
          ctx.restore();
        }
        break;
      }
      case 'WhipPan': {
        const easeFast = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        ctx.save();
        ctx.translate(-width * easeFast, 0);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        ctx.save();
        ctx.translate(width * (1 - easeFast), 0);
        this.renderSingleClip(ctx, clipB, 0, width, height);
        ctx.restore();
        break;
      }
      case 'FilmBurn': {
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        const burnIntensity = Math.sin(p * Math.PI);
        const burnGrad = ctx.createRadialGradient(
          width * (0.2 + p * 0.6), height * 0.5, 20,
          width * (0.2 + p * 0.6), height * 0.5, width * 0.8
        );
        burnGrad.addColorStop(0, `rgba(255, 210, 60, ${burnIntensity * 0.85})`);
        burnGrad.addColorStop(0.35, `rgba(251, 113, 36, ${burnIntensity * 0.7})`);
        burnGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.save();
        ctx.fillStyle = burnGrad;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        if (p >= 0.5) {
          ctx.save();
          ctx.globalAlpha = (p - 0.5) * 2;
          this.renderSingleClip(ctx, clipB, 0, width, height);
          ctx.restore();
        }
        break;
      }
      case 'ZoomBlur': {
        const zoomA = 1.0 + easeP * 0.35;
        ctx.save();
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoomA, zoomA);
        ctx.translate(-width * 0.5, -height * 0.5);
        this.renderSingleClip(ctx, clipA, localTime, width, height);
        ctx.restore();

        if (p >= 0.3) {
          const zoomB = 1.35 - (p - 0.3) * (0.35 / 0.7);
          ctx.save();
          ctx.globalAlpha = Math.min(1.0, (p - 0.3) / 0.7);
          ctx.translate(width * 0.5, height * 0.5);
          ctx.scale(zoomB, zoomB);
          ctx.translate(-width * 0.5, -height * 0.5);
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
        if (clip.overlay || clip.words) {
          this.renderTextClip(ctx, clip, localTime, width, height);
        } else if (clip.sticker) {
          this.renderStickerClip(ctx, clip, localTime, width, height);
        }
      }
    });
  }

  renderTextClip(ctx, clip, localTime, width, height) {
    const ov = clip.overlay || { text: clip.name || '', fontSize: 56, fontFamily: 'Inter' };

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

    // Check for Karaoke Word Sync (Hormozi / TikTok Bouncing Subtitles)
    if (clip.words && clip.words.length > 0) {
      const words = clip.words;
      const fullText = words.map(w => w.word).join(' ');
      const totalTextWidth = ctx.measureText(fullText).width;

      // Draw frosted backdrop pill
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.beginPath();
      const padX = fontSize * 0.8;
      const padY = fontSize * 0.45;
      const pillW = totalTextWidth + padX * 2;
      const pillH = fontSize * 1.5 + padY;
      ctx.roundRect(-pillW * 0.5, -pillH * 0.5, pillW, pillH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Render words with active word highlight & spring bounce
      let curX = -totalTextWidth * 0.5;
      words.forEach(wObj => {
        const wordStr = wObj.word + ' ';
        const wordW = ctx.measureText(wordStr).width;
        const isWordActive = localTime >= wObj.startTime && localTime < (wObj.startTime + wObj.duration);

        ctx.save();
        if (isWordActive) {
          // Bouncy word scale and glowing highlight
          ctx.translate(curX + wordW * 0.5, 0);
          ctx.scale(1.2, 1.2);
          ctx.translate(-(curX + wordW * 0.5), 0);

          ctx.fillStyle = '#FDE047'; // Neon Yellow
          ctx.shadowColor = '#EAB308';
          ctx.shadowBlur = 16;
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
        }

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(3, fontSize * 0.12);
        ctx.strokeText(wObj.word, curX + wordW * 0.5, 0);
        ctx.fillText(wObj.word, curX + wordW * 0.5, 0);
        ctx.restore();

        curX += wordW;
      });

      ctx.restore();
      return;
    }

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

  // --- Sticker & Emoji Overlay Renderer ---
  renderStickerClip(ctx, clip, localTime, width, height) {
    if (!clip.sticker) return;
    const st = clip.sticker;

    ctx.save();

    let scale = 1.0;
    const animDur = 0.5;
    if (localTime < animDur) {
      const p = localTime / animDur;
      scale = 0.3 + 0.7 * this.easeInOut(p);
    }

    const emojiSize = Math.round((st.fontSize || 72) * (width / 1920));
    ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = width * (clip.transform?.anchorX || 0.5);
    const y = height * (clip.transform?.anchorY || 0.5);

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(st.emoji || '🔥', 0, 0);

    ctx.restore();
  }

  // --- Real-Time Procedural Atmospheric Particle Overlays ---
  renderParticleEffects(ctx, width, height, effectType, timestamp) {
    ctx.save();

    if (effectType === 'sparkles') {
      // Golden shimmering stardust particles
      const count = 28;
      for (let i = 0; i < count; i++) {
        const seed = i * 137.5;
        const x = ((seed + timestamp * 40) % width);
        const y = ((seed * 1.5 + Math.sin(timestamp + i) * 30 + timestamp * 15) % height);
        const alpha = Math.abs(Math.sin(timestamp * 2 + i)) * 0.8 + 0.1;
        const radius = (i % 3) + 2;

        ctx.fillStyle = `rgba(253, 224, 71, ${alpha})`;
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (effectType === 'snow') {
      // Drifting snowfall
      const count = 35;
      for (let i = 0; i < count; i++) {
        const seed = i * 89.3;
        const speed = (i % 4) + 1.5;
        const y = ((seed + timestamp * speed * 60) % (height + 20));
        const x = ((seed * 2 + Math.sin(timestamp * 1.5 + i) * 40) % width);
        const radius = (i % 3) + 1.5;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (effectType === 'flare') {
      // Warm Cinematic Lens Flare & Anamorphic Light Leak
      const pulse = Math.sin(timestamp * 1.2) * 0.15 + 0.35;
      const grad = ctx.createRadialGradient(
        width * 0.8, height * 0.2, 20,
        width * 0.8, height * 0.2, width * 0.7
      );
      grad.addColorStop(0, `rgba(251, 146, 60, ${pulse * 1.2})`);
      grad.addColorStop(0.4, `rgba(239, 68, 68, ${pulse * 0.5})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (effectType === 'hearts') {
      // Floating romantic heart particles
      const count = 12;
      for (let i = 0; i < count; i++) {
        const seed = i * 120.7;
        const y = height - ((seed + timestamp * 50) % (height + 60));
        const x = ((seed * 1.8 + Math.sin(timestamp * 2 + i) * 35) % width);
        const alpha = Math.max(0, 1 - (y / height)) * 0.7;

        ctx.font = '24px serif';
        ctx.fillStyle = `rgba(244, 63, 94, ${alpha})`;
        ctx.fillText('❤️', x, y);
      }
    } else if (effectType === 'grain') {
      // Film dust / scratch
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      for (let i = 0; i < 20; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        ctx.fillRect(rx, ry, Math.random() * 2, Math.random() * 2);
      }
    }

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

  renderSafeZones(ctx, width, height, platform) {
    if (!platform || platform === 'none') return;
    ctx.save();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    if (platform === 'reels') {
      const topH = height * 0.12;
      const bottomH = height * 0.20;
      const rightW = width * 0.18;

      ctx.strokeRect(width * 0.05, topH, width * 0.90 - rightW, height - topH - bottomH);

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.font = `bold ${Math.max(12, Math.round(width * 0.024))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('📐 Instagram Reels Safe Zone', width * 0.06, topH + 24);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(width - rightW, topH, rightW, height - topH - bottomH);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.font = `bold ${Math.max(10, Math.round(width * 0.018))}px sans-serif`;
      ctx.fillText('Actions Zone', width - rightW + 6, topH + 24);
    } else if (platform === 'tiktok') {
      const topH = height * 0.14;
      const bottomH = height * 0.24;
      const rightW = width * 0.20;

      ctx.strokeRect(width * 0.05, topH, width * 0.90 - rightW, height - topH - bottomH);

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      ctx.font = `bold ${Math.max(12, Math.round(width * 0.024))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('📐 TikTok Safe Zone', width * 0.06, topH + 24);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(width - rightW, topH, rightW, height - topH - bottomH);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.font = `bold ${Math.max(10, Math.round(width * 0.018))}px sans-serif`;
      ctx.fillText('TikTok Icons', width - rightW + 6, topH + 24);
    } else if (platform === 'shorts') {
      const topH = height * 0.10;
      const bottomH = height * 0.22;
      const rightW = width * 0.18;

      ctx.strokeRect(width * 0.05, topH, width * 0.90 - rightW, height - topH - bottomH);

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.font = `bold ${Math.max(12, Math.round(width * 0.024))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('📐 YouTube Shorts Safe Zone', width * 0.06, topH + 24);
    }

    ctx.restore();
  }

  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}
