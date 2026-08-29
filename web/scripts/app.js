(function () {
  'use strict';

  // --- Project State ---
  let currentProject = createDefaultProject('My Web Video', '9:16');
  let currentTime = 0.0;
  let isPlaying = false;
  let selectedClip = null;
  let animFrameId = null;
  let lastPlayTimestamp = 0;

  // --- Services ---
  const canvas = document.getElementById('videoCanvas');
  const engine = new VideoCanvasEngine(canvas);
  const audio = new WebAudioPlayer();
  const exporter = new VideoWebExporter(engine);

  // --- DOM Elements ---
  const screens = {
    home: document.getElementById('screen-home'),
    wizard: document.getElementById('screen-wizard'),
    editor: document.getElementById('screen-editor')
  };

  const navBtns = {
    home: document.getElementById('nav-home'),
    wizard: document.getElementById('nav-wizard'),
    editor: document.getElementById('nav-editor')
  };

  // --- Initialization ---
  function init() {
    setupNavigation();
    setupHomeScreen();
    setupWizard();
    setupEditor();
    setupInspector();
    setupExportModal();

    // Default to Home Screen
    switchScreen('home');

    // Canvas render loop
    startRenderLoop();
  }

  // --- Screen Switching ---
  function switchScreen(screenName) {
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === screenName);
    });
    Object.keys(navBtns).forEach(key => {
      navBtns[key].classList.toggle('active', key === screenName);
    });

    if (screenName === 'editor') {
      refreshTimeline();
      refreshMediaLibrary();
      updateInspector();
      resizeCanvasWrapper();
    }
  }

  function setupNavigation() {
    navBtns.home.addEventListener('click', () => switchScreen('home'));
    navBtns.wizard.addEventListener('click', () => switchScreen('wizard'));
    navBtns.editor.addEventListener('click', () => switchScreen('editor'));

    document.getElementById('btn-new-project').addEventListener('click', () => {
      currentProject = createDefaultProject('New Video Story', '9:16');
      currentTime = 0;
      selectedClip = null;
      switchScreen('editor');
    });

    document.getElementById('btn-open-project').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.vcproj,.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            currentProject = convertVcprojToWeb(data);
            currentTime = 0;
            selectedClip = null;
            switchScreen('editor');
          } catch (err) {
            alert('Failed to load project file.');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // --- Home Screen ---
  function setupHomeScreen() {
    document.getElementById('hero-quick-create').addEventListener('click', () => switchScreen('wizard'));
    document.getElementById('hero-blank-project').addEventListener('click', () => {
      currentProject = createDefaultProject('Blank Project', '16:9');
      switchScreen('editor');
    });

    // Populate Templates
    const container = document.getElementById('home-templates-grid');
    container.innerHTML = '';
    window.VideoCreatorTemplates.forEach(t => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div style="font-size:24px;">✨</div>
        <h4>${t.name}</h4>
        <p>${t.description}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">
          <span class="badge">${t.aspectRatio}</span>
          <button class="btn btn-primary btn-sm">Use Template</button>
        </div>
      `;
      card.addEventListener('click', () => {
        applyTemplate(t);
        switchScreen('wizard');
      });
      container.appendChild(card);
    });
  }

  // --- Quick Create Wizard ---
  const wizardState = {
    photos: [],
    musicFile: null,
    musicUrl: null,
    template: window.VideoCreatorTemplates[0],
    aspectRatio: '9:16'
  };

  function setupWizard() {
    const photoDropzone = document.getElementById('photo-dropzone');
    const photoInput = document.getElementById('photo-file-input');
    const photoChips = document.getElementById('wizard-photo-chips');

    photoDropzone.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', (e) => handlePhotoFiles(e.target.files));

    photoDropzone.addEventListener('dragover', (e) => { e.preventDefault(); photoDropzone.classList.add('dragover'); });
    photoDropzone.addEventListener('dragleave', () => photoDropzone.classList.remove('dragover'));
    photoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      photoDropzone.classList.remove('dragover');
      handlePhotoFiles(e.dataTransfer.files);
    });

    function handlePhotoFiles(files) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          wizardState.photos.push({ name: file.name, url, file });
          engine.loadImage(url);
        }
      });
      renderPhotoChips();
    }

    function renderPhotoChips() {
      photoChips.innerHTML = '';
      wizardState.photos.forEach((p, idx) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `<span>📷 ${p.name}</span><span class="chip-remove" data-idx="${idx}">✕</span>`;
        photoChips.appendChild(chip);
      });
      photoChips.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          wizardState.photos.splice(idx, 1);
          renderPhotoChips();
        });
      });
    }

    // Music Upload
    const musicDropzone = document.getElementById('music-dropzone');
    const musicInput = document.getElementById('music-file-input');
    const musicName = document.getElementById('wizard-music-name');

    musicDropzone.addEventListener('click', () => musicInput.click());
    musicInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        wizardState.musicFile = file;
        wizardState.musicUrl = URL.createObjectURL(file);
        musicName.textContent = `🎵 ${file.name}`;
      }
    });

    // Template Picker in Wizard
    const templateSelect = document.getElementById('wizard-template-select');
    templateSelect.innerHTML = '';
    window.VideoCreatorTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.aspectRatio})`;
      templateSelect.appendChild(opt);
    });
    templateSelect.addEventListener('change', (e) => {
      wizardState.template = window.VideoCreatorTemplates.find(t => t.id === e.target.value);
    });

    // Generate Button
    document.getElementById('wizard-generate-btn').addEventListener('click', () => {
      if (wizardState.photos.length === 0) {
        alert('Please upload at least 1 photo to create your video.');
        return;
      }

      currentProject = generateProjectFromWizard(wizardState);
      currentTime = 0;
      switchScreen('editor');
    });
  }

  // --- Studio Editor ---
  function setupEditor() {
    document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('btn-step-backward').addEventListener('click', () => seek(currentTime - 1 / 30));
    document.getElementById('btn-step-forward').addEventListener('click', () => seek(currentTime + 1 / 30));

    // Global Hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'KeyS') {
        splitSelectedClip();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        deleteSelectedClip();
      }
    });

    // Aspect ratio switcher in toolbar
    document.getElementById('editor-aspect-select').addEventListener('change', (e) => {
      setAspectRatio(e.target.value);
    });

    // Project Name edit
    const titleInput = document.getElementById('editor-project-title');
    titleInput.addEventListener('input', (e) => {
      currentProject.metadata.name = e.target.value;
    });

    // Save project JSON (.vcproj)
    document.getElementById('btn-save-project').addEventListener('click', () => {
      const json = JSON.stringify(currentProject, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${currentProject.metadata.name || 'project'}.vcproj`;
      a.click();
    });

    // Export button
    document.getElementById('btn-open-export').addEventListener('click', () => {
      document.getElementById('export-modal').classList.add('active');
    });

    // Library Tabs
    document.querySelectorAll('.panel-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel-tab-content').forEach(c => c.style.display = 'none');
        e.target.classList.add('active');
        const tab = e.target.dataset.tab;
        document.getElementById(`tab-content-${tab}`).style.display = 'flex';
      });
    });

    // Media uploads in editor
    const editorPhotoInput = document.getElementById('editor-photo-input');
    document.getElementById('editor-add-photo-btn').addEventListener('click', () => editorPhotoInput.click());
    editorPhotoInput.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(file => {
        const url = URL.createObjectURL(file);
        currentProject.assets.push({ id: `asset-${Date.now()}-${Math.random()}`, name: file.name, type: 'image', source: url });
        engine.loadImage(url);
      });
      refreshMediaLibrary();
    });

    const editorMusicInput = document.getElementById('editor-music-input');
    document.getElementById('editor-add-music-btn').addEventListener('click', () => editorMusicInput.click());
    editorMusicInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        currentProject.assets.push({ id: `asset-audio-${Date.now()}`, name: file.name, type: 'audio', source: url });
        setProjectMusic(url);
        refreshMediaLibrary();
      }
    });

    // Add Text Overlay at playhead
    document.getElementById('editor-add-text-btn').addEventListener('click', () => {
      addTextAtPlayhead('New Title', 'Inter', 48, '#FFFFFF');
    });

    // Text Presets list
    setupTextPresets();

    // Timeline Scrubbing
    const timelineArea = document.getElementById('timeline-tracks-area');
    timelineArea.addEventListener('click', (e) => {
      const rect = timelineArea.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineArea.scrollLeft;
      const sec = Math.max(0, clickX / 80); // 80px per second
      seek(sec);
    });
  }

  function setupTextPresets() {
    const presets = [
      { name: '⚡ Viral Reel Title', font: 'Impact', size: 64, color: '#FACC15', bg: '#000000', anim: 'Pop' },
      { name: '🌸 Aesthetic Vlog Note', font: 'Georgia', size: 36, color: '#FFFFFF', bg: 'rgba(30,27,75,0.7)', anim: 'Fade' },
      { name: '⌨️ Typewriter Story', font: 'Courier New', size: 40, color: '#E2E8F0', bg: 'rgba(0,0,0,0.8)', anim: 'Typewriter' },
      { name: '🔥 Bold Motivation Pop', font: 'Arial', size: 56, color: '#EF4444', bg: '#FFFFFF', anim: 'Zoom' },
      { name: '✨ Luxury Gold Lower Third', font: 'Cinzel', size: 44, color: '#FDE047', bg: 'rgba(15,23,42,0.85)', anim: 'Slide' }
    ];

    const container = document.getElementById('text-presets-list');
    container.innerHTML = '';
    presets.forEach(p => {
      const div = document.createElement('div');
      div.className = 'asset-item';
      div.innerHTML = `
        <span style="font-size:12px; font-weight:600;">${p.name}</span>
        <button class="btn btn-secondary btn-sm">+ Insert</button>
      `;
      div.querySelector('button').addEventListener('click', () => {
        addTextAtPlayhead(p.name.replace(/[^a-zA-Z0-9 ]/g, '').trim(), p.font, p.size, p.color, p.bg, p.anim);
      });
      container.appendChild(div);
    });
  }

  function addTextAtPlayhead(text, fontFamily = 'Inter', fontSize = 48, colorHex = '#FFFFFF', bgHex = 'rgba(0,0,0,0.6)', entryAnim = 'Slide') {
    let overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
    if (!overlayTrack) {
      overlayTrack = { id: 'track-overlay-1', type: 'overlay', clips: [] };
      currentProject.timeline.tracks.push(overlayTrack);
    }

    const clip = {
      id: `clip-text-${Date.now()}`,
      startTime: currentTime,
      duration: 3.0,
      overlay: {
        text: text,
        fontFamily: fontFamily,
        fontSize: fontSize,
        colorHex: colorHex,
        backgroundColorHex: bgHex,
        entryAnimation: entryAnim,
        animationDuration: 0.6
      },
      transform: { anchorX: 0.5, anchorY: 0.85 }
    };

    overlayTrack.clips.push(clip);
    selectedClip = clip;
    recalculateDuration();
    refreshTimeline();
    updateInspector();
  }

  function setProjectMusic(url) {
    audio.loadAudio(url);
    let audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio');
    if (!audioTrack) {
      audioTrack = { id: 'track-audio-1', type: 'audio', clips: [] };
      currentProject.timeline.tracks.push(audioTrack);
    }
    audioTrack.clips = [{
      id: `clip-audio-${Date.now()}`,
      startTime: 0,
      duration: currentProject.timeline.totalDuration || 10.0,
      source: url,
      volume: 1.0
    }];
    refreshTimeline();
  }

  // --- Inspector Setup (Rotate, Flip, Scale, Pan, Filters, Typography) ---
  function setupInspector() {
    // Rotate Buttons
    document.getElementById('btn-rotate-left').addEventListener('click', () => rotateSelectedClip(-90));
    document.getElementById('btn-rotate-right').addEventListener('click', () => rotateSelectedClip(90));
    document.getElementById('btn-flip-h').addEventListener('click', () => toggleFlipSelectedClip('flipX'));
    document.getElementById('btn-flip-v').addEventListener('click', () => toggleFlipSelectedClip('flipY'));
    document.getElementById('btn-reset-transform').addEventListener('click', () => resetSelectedClipTransform());

    // Sliders
    bindSlider('input-rotation-angle', 'val-rotation-angle', (val) => {
      if (selectedClip && selectedClip.transform) selectedClip.transform.rotationDegrees = parseFloat(val);
    });

    bindSlider('input-scale-zoom', 'val-scale-zoom', (val) => {
      if (selectedClip && selectedClip.transform) selectedClip.transform.scaleX = parseFloat(val);
    }, 'x');

    bindSlider('input-opacity', 'val-opacity', (val) => {
      if (selectedClip && selectedClip.transform) selectedClip.transform.opacity = parseFloat(val) / 100;
    }, '%');

    // Motion & Crop select
    document.getElementById('select-clip-motion').addEventListener('change', (e) => {
      if (selectedClip) selectedClip.motion = e.target.value;
    });
    document.getElementById('select-clip-crop').addEventListener('change', (e) => {
      if (selectedClip) selectedClip.cropMode = e.target.value;
    });

    // Text Inspector Inputs
    document.getElementById('input-text-content').addEventListener('input', (e) => {
      if (selectedClip && selectedClip.overlay) {
        selectedClip.overlay.text = e.target.value;
        refreshTimeline();
      }
    });

    document.getElementById('select-text-font').addEventListener('change', (e) => {
      if (selectedClip && selectedClip.overlay) selectedClip.overlay.fontFamily = e.target.value;
    });

    bindSlider('input-text-size', 'val-text-size', (val) => {
      if (selectedClip && selectedClip.overlay) selectedClip.overlay.fontSize = parseInt(val);
    }, 'px');

    document.getElementById('input-text-color').addEventListener('input', (e) => {
      if (selectedClip && selectedClip.overlay) selectedClip.overlay.colorHex = e.target.value;
    });

    document.getElementById('input-text-bg').addEventListener('input', (e) => {
      if (selectedClip && selectedClip.overlay) selectedClip.overlay.backgroundColorHex = e.target.value;
    });

    document.getElementById('select-text-anim').addEventListener('change', (e) => {
      if (selectedClip && selectedClip.overlay) selectedClip.overlay.entryAnimation = e.target.value;
    });
  }

  function bindSlider(sliderId, valId, onChange, unit = '') {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(valId);
    slider.addEventListener('input', (e) => {
      label.textContent = `${e.target.value}${unit}`;
      onChange(e.target.value);
    });
  }

  function rotateSelectedClip(delta) {
    if (!selectedClip || !selectedClip.transform) return;
    selectedClip.transform.rotationDegrees = ((selectedClip.transform.rotationDegrees || 0) + delta) % 360;
    if (selectedClip.transform.rotationDegrees < -180) selectedClip.transform.rotationDegrees += 360;
    if (selectedClip.transform.rotationDegrees > 180) selectedClip.transform.rotationDegrees -= 360;
    updateInspector();
  }

  function toggleFlipSelectedClip(prop) {
    if (!selectedClip || !selectedClip.transform) return;
    selectedClip.transform[prop] = !selectedClip.transform[prop];
    updateInspector();
  }

  function resetSelectedClipTransform() {
    if (!selectedClip || !selectedClip.transform) return;
    selectedClip.transform.rotationDegrees = 0;
    selectedClip.transform.flipX = false;
    selectedClip.transform.flipY = false;
    selectedClip.transform.scaleX = 1.0;
    selectedClip.transform.positionX = 0;
    selectedClip.transform.positionY = 0;
    selectedClip.transform.opacity = 1.0;
    updateInspector();
  }

  function updateInspector() {
    const photoGroup = document.getElementById('inspector-photo-group');
    const textGroup = document.getElementById('inspector-text-group');

    if (!selectedClip) {
      photoGroup.style.display = 'none';
      textGroup.style.display = 'none';
      return;
    }

    if (selectedClip.source) {
      // Photo Clip
      photoGroup.style.display = 'flex';
      textGroup.style.display = 'none';

      const tf = selectedClip.transform || { rotationDegrees: 0, scaleX: 1.0, opacity: 1.0 };
      document.getElementById('input-rotation-angle').value = tf.rotationDegrees || 0;
      document.getElementById('val-rotation-angle').textContent = `${Math.round(tf.rotationDegrees || 0)}°`;
      document.getElementById('input-scale-zoom').value = tf.scaleX || 1.0;
      document.getElementById('val-scale-zoom').textContent = `${(tf.scaleX || 1.0).toFixed(2)}x`;
      document.getElementById('input-opacity').value = Math.round((tf.opacity !== undefined ? tf.opacity : 1.0) * 100);
      document.getElementById('val-opacity').textContent = `${Math.round((tf.opacity !== undefined ? tf.opacity : 1.0) * 100)}%`;

      document.getElementById('select-clip-motion').value = selectedClip.motion || 'ZoomIn';
      document.getElementById('select-clip-crop').value = selectedClip.cropMode || 'BlurBackground';
    } else if (selectedClip.overlay) {
      // Text Clip
      photoGroup.style.display = 'none';
      textGroup.style.display = 'flex';

      const ov = selectedClip.overlay;
      document.getElementById('input-text-content').value = ov.text || '';
      document.getElementById('select-text-font').value = ov.fontFamily || 'Inter';
      document.getElementById('input-text-size').value = ov.fontSize || 48;
      document.getElementById('val-text-size').textContent = `${ov.fontSize || 48}px`;
      document.getElementById('input-text-color').value = ov.colorHex || '#FFFFFF';
      document.getElementById('input-text-bg').value = ov.backgroundColorHex || 'rgba(0,0,0,0.6)';
      document.getElementById('select-text-anim').value = ov.entryAnimation || 'Slide';
    }
  }

  // --- Transport Controls ---
  function togglePlayPause() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('btn-play-pause');
    btn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';

    if (isPlaying) {
      audio.playAt(currentTime);
      lastPlayTimestamp = performance.now();
    } else {
      audio.pause();
    }
  }

  function seek(timeSec) {
    const totalDur = currentProject.timeline.totalDuration || 5.0;
    currentTime = Math.max(0, Math.min(totalDur, timeSec));
    audio.seek(currentTime);
    updatePlayheadPosition();
  }

  function startRenderLoop() {
    function loop(timestamp) {
      if (isPlaying) {
        const deltaSec = (timestamp - lastPlayTimestamp) / 1000;
        lastPlayTimestamp = timestamp;
        currentTime += deltaSec;

        const totalDur = currentProject.timeline.totalDuration || 5.0;
        if (currentTime >= totalDur) {
          currentTime = 0;
          togglePlayPause();
        }
        updatePlayheadPosition();
      }

      engine.render(currentProject, currentTime);
      animFrameId = requestAnimationFrame(loop);
    }
    animFrameId = requestAnimationFrame(loop);
  }

  function updatePlayheadPosition() {
    const playhead = document.getElementById('timeline-playhead');
    const px = currentTime * 80; // 80px per sec
    playhead.style.left = `${px + 10}px`;

    // Timecode
    const mins = Math.floor(currentTime / 60);
    const secs = Math.floor(currentTime % 60);
    const ms = Math.floor((currentTime % 1) * 100);
    document.getElementById('editor-timecode').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }

  // --- Timeline Rendering ---
  function refreshTimeline() {
    const videoTrackArea = document.getElementById('timeline-video-track');
    const textTrackArea = document.getElementById('timeline-text-track');
    const audioTrackArea = document.getElementById('timeline-audio-track');

    videoTrackArea.innerHTML = '';
    textTrackArea.innerHTML = '';
    audioTrackArea.innerHTML = '';

    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      videoTrack.clips.forEach(clip => {
        const block = createClipBlock(clip, 'clip-video', `📸 Photo (${clip.duration.toFixed(1)}s)`);
        videoTrackArea.appendChild(block);
      });
    }

    const overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
    if (overlayTrack) {
      overlayTrack.clips.forEach(clip => {
        const block = createClipBlock(clip, 'clip-text', `🔤 ${clip.overlay?.text || 'Text'}`);
        textTrackArea.appendChild(block);
      });
    }

    const audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio');
    if (audioTrack) {
      audioTrack.clips.forEach(clip => {
        const block = createClipBlock(clip, 'clip-audio', `🎵 Music`);
        audioTrackArea.appendChild(block);
      });
    }

    updatePlayheadPosition();
  }

  function createClipBlock(clip, className, label) {
    const div = document.createElement('div');
    div.className = `clip-block ${className} ${selectedClip === clip ? 'selected' : ''}`;
    div.style.left = `${clip.startTime * 80}px`;
    div.style.width = `${clip.duration * 80}px`;
    div.textContent = label;

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedClip = clip;
      seek(clip.startTime);
      refreshTimeline();
      updateInspector();
    });

    return div;
  }

  function splitSelectedClip() {
    if (!selectedClip || !selectedClip.source) return;
    const splitPoint = currentTime - selectedClip.startTime;
    if (splitPoint <= 0.2 || splitPoint >= selectedClip.duration - 0.2) return;

    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    const idx = videoTrack.clips.indexOf(selectedClip);
    if (idx === -1) return;

    const originalDur = selectedClip.duration;
    selectedClip.duration = splitPoint;

    const newClip = {
      ...selectedClip,
      id: `clip-split-${Date.now()}`,
      startTime: selectedClip.startTime + splitPoint,
      duration: originalDur - splitPoint,
      transform: { ...selectedClip.transform }
    };

    videoTrack.clips.splice(idx + 1, 0, newClip);
    selectedClip = newClip;
    refreshTimeline();
    updateInspector();
  }

  function deleteSelectedClip() {
    if (!selectedClip) return;
    currentProject.timeline.tracks.forEach(t => {
      const idx = t.clips.indexOf(selectedClip);
      if (idx !== -1) {
        t.clips.splice(idx, 1);
      }
    });

    // Compact remaining video clips
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      let t = 0;
      videoTrack.clips.forEach(c => {
        c.startTime = t;
        t += c.duration;
      });
    }

    selectedClip = null;
    recalculateDuration();
    refreshTimeline();
    updateInspector();
  }

  function recalculateDuration() {
    let max = 0;
    currentProject.timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        const end = clip.startTime + clip.duration;
        if (end > max) max = end;
      });
    });
    currentProject.timeline.totalDuration = max;
  }

  function setAspectRatio(ratio) {
    if (ratio === '9:16') {
      currentProject.canvas.width = 1080;
      currentProject.canvas.height = 1920;
    } else if (ratio === '16:9') {
      currentProject.canvas.width = 1920;
      currentProject.canvas.height = 1080;
    } else if (ratio === '1:1') {
      currentProject.canvas.width = 1080;
      currentProject.canvas.height = 1080;
    }
    resizeCanvasWrapper();
  }

  function resizeCanvasWrapper() {
    const wrapper = document.getElementById('canvas-wrapper');
    const { width, height } = currentProject.canvas;
    const aspect = width / height;

    const maxH = 480;
    const maxW = 720;

    let targetH = maxH;
    let targetW = targetH * aspect;
    if (targetW > maxW) {
      targetW = maxW;
      targetH = targetW / aspect;
    }

    wrapper.style.width = `${targetW}px`;
    wrapper.style.height = `${targetH}px`;
  }

  function refreshMediaLibrary() {
    const photoList = document.getElementById('library-photos-list');
    photoList.innerHTML = '';
    currentProject.assets.filter(a => a.type === 'image').forEach(asset => {
      const item = document.createElement('div');
      item.className = 'asset-item';
      item.innerHTML = `
        <span class="asset-name">📷 ${asset.name}</span>
        <div style="display:flex; gap:4px;">
          <button class="btn btn-secondary btn-sm insert-btn">+ Insert</button>
          <button class="btn btn-danger btn-sm remove-btn">🗑</button>
        </div>
      `;
      item.querySelector('.insert-btn').addEventListener('click', () => {
        insertPhotoAtPlayhead(asset.source);
      });
      item.querySelector('.remove-btn').addEventListener('click', () => {
        removeAsset(asset);
      });
      photoList.appendChild(item);
    });
  }

  function insertPhotoAtPlayhead(src) {
    let videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (!videoTrack) {
      videoTrack = { id: 'track-video-1', type: 'video', clips: [] };
      currentProject.timeline.tracks.push(videoTrack);
    }
    const clip = {
      id: `clip-photo-${Date.now()}`,
      startTime: currentTime,
      duration: 3.0,
      source: src,
      motion: 'ZoomIn',
      cropMode: 'BlurBackground',
      transitionOut: { type: 'CrossDissolve', duration: 0.6 },
      transform: { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 }
    };
    videoTrack.clips.push(clip);
    selectedClip = clip;
    recalculateDuration();
    refreshTimeline();
    updateInspector();
  }

  function removeAsset(asset) {
    currentProject.assets = currentProject.assets.filter(a => a !== asset);
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      videoTrack.clips = videoTrack.clips.filter(c => c.source !== asset.source);
    }
    recalculateDuration();
    refreshMediaLibrary();
    refreshTimeline();
  }

  // --- Export Modal ---
  function setupExportModal() {
    const modal = document.getElementById('export-modal');
    document.getElementById('btn-close-export').addEventListener('click', () => modal.classList.remove('active'));

    document.getElementById('btn-start-export').addEventListener('click', async () => {
      const exportBtn = document.getElementById('btn-start-export');
      const progressContainer = document.getElementById('export-progress-group');
      const progressFill = document.getElementById('export-progress-fill');
      const progressLabel = document.getElementById('export-progress-label');

      exportBtn.disabled = true;
      progressContainer.style.display = 'block';

      try {
        const result = await exporter.exportVideo(currentProject, { fps: 30 }, (p) => {
          progressFill.style.width = `${p.percentage}%`;
          progressLabel.textContent = `Encoding: ${p.percentage}% (Frame ${p.currentFrame}/${p.totalFrames})`;
        });

        progressLabel.textContent = 'Export Complete! Downloading video...';
        const a = document.createElement('a');
        a.href = result.url;
        a.download = `${currentProject.metadata.name || 'video'}.${result.ext}`;
        a.click();

        setTimeout(() => {
          modal.classList.remove('active');
          exportBtn.disabled = false;
          progressContainer.style.display = 'none';
        }, 1500);
      } catch (err) {
        alert('Export failed: ' + err.message);
        exportBtn.disabled = false;
      }
    });
  }

  // --- Helpers ---
  function createDefaultProject(name, aspect = '9:16') {
    const isPortrait = aspect === '9:16';
    return {
      metadata: { name, version: '1.0' },
      canvas: {
        width: isPortrait ? 1080 : 1920,
        height: isPortrait ? 1920 : 1080,
        fps: 30,
        backgroundColor: '#000000'
      },
      assets: [],
      timeline: {
        totalDuration: 0,
        tracks: [
          { id: 'track-video-1', type: 'video', clips: [] },
          { id: 'track-overlay-1', type: 'overlay', clips: [] },
          { id: 'track-audio-1', type: 'audio', clips: [] }
        ]
      }
    };
  }

  function generateProjectFromWizard(state) {
    const proj = createDefaultProject('My Reel Story', state.aspectRatio);
    let curTime = 0;
    const durPerPhoto = state.template.photoDuration || 2.5;

    state.photos.forEach((photo, idx) => {
      proj.assets.push({ id: `asset-${idx}`, name: photo.name, type: 'image', source: photo.url });

      const clip = {
        id: `clip-video-${idx}`,
        startTime: curTime,
        duration: durPerPhoto,
        source: photo.url,
        motion: state.template.motion || 'ZoomIn',
        cropMode: state.template.cropMode || 'BlurBackground',
        transitionOut: { type: state.template.transition || 'CrossDissolve', duration: state.template.transitionDuration || 0.5 },
        transform: { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 },
        effects: state.template.effects || []
      };

      proj.timeline.tracks[0].clips.push(clip);
      curTime += durPerPhoto;
    });

    // Add Title Overlay
    if (state.template.suggestedTitle) {
      proj.timeline.tracks[1].clips.push({
        id: 'clip-title-1',
        startTime: 0.2,
        duration: Math.min(3.5, curTime),
        overlay: {
          text: state.template.suggestedTitle,
          fontFamily: 'Inter',
          fontSize: 54,
          colorHex: '#FFFFFF',
          backgroundColorHex: 'rgba(0,0,0,0.6)',
          entryAnimation: 'Slide',
          animationDuration: 0.6
        },
        transform: { anchorX: 0.5, anchorY: 0.85 }
      });
    }

    // Add Music
    if (state.musicUrl) {
      proj.assets.push({ id: 'asset-music-1', name: state.musicFile?.name || 'Music', type: 'audio', source: state.musicUrl });
      proj.timeline.tracks[2].clips.push({
        id: 'clip-music-1',
        startTime: 0,
        duration: curTime,
        source: state.musicUrl,
        volume: 1.0
      });
      audio.loadAudio(state.musicUrl);
    }

    proj.timeline.totalDuration = curTime;
    return proj;
  }

  function applyTemplate(template) {
    wizardState.template = template;
    wizardState.aspectRatio = template.aspectRatio;
  }

  function convertVcprojToWeb(vcproj) {
    // Schema adapter
    return {
      metadata: { name: vcproj.Metadata?.Name || 'Imported Project' },
      canvas: {
        width: vcproj.Canvas?.Width || 1080,
        height: vcproj.Canvas?.Height || 1920,
        fps: vcproj.Canvas?.Fps || 30
      },
      assets: (vcproj.Assets || []).map(a => ({
        id: a.Id,
        name: a.Name,
        type: a.Type === 0 ? 'image' : 'audio',
        source: a.FilePath
      })),
      timeline: {
        totalDuration: 10.0,
        tracks: (vcproj.Timeline?.Tracks || []).map(t => ({
          id: t.Id,
          type: t.Type === 0 ? 'video' : t.Type === 1 ? 'audio' : 'overlay',
          clips: (t.Clips || []).map(c => ({
            id: c.Id,
            startTime: c.StartTime ? parseFloat(c.StartTime) : 0,
            duration: c.Duration ? parseFloat(c.Duration) : 3,
            source: c.SourceFilePath,
            motion: c.Motion || 'ZoomIn',
            cropMode: c.CropMode || 'BlurBackground',
            transform: {
              rotationDegrees: c.Transform?.RotationDegrees || 0,
              scaleX: c.Transform?.ScaleX || 1,
              flipX: c.Transform?.FlipX || false,
              flipY: c.Transform?.FlipY || false,
              opacity: c.Transform?.Opacity || 1
            },
            overlay: c.Overlay
          }))
        }))
      }
    };
  }

  window.addEventListener('DOMContentLoaded', init);
})();
