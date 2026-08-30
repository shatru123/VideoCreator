(function () {
  'use strict';

  // --- Initial Default Project State (matching rich screenshot layout) ---
  let currentProject = createDefaultProject('Sunset Adventure', '16:9');
  let currentTime = 1.38; // 00:01:23
  let isPlaying = false;
  let selectedClip = null;
  let animFrameId = null;
  let lastPlayTimestamp = 0;
  let timelineZoom = 80;

  const undoStack = [];
  const redoStack = [];

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
    setupAutosaveAndRecovery();

    // Populate initial sample content
    populateSampleMedia();

    // Default to Home Screen
    switchScreen('home');

    // Canvas render loop
    startRenderLoop();
  }

  function pushHistory() {
    undoStack.push(JSON.stringify(currentProject));
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(currentProject));
    const previous = undoStack.pop();
    currentProject = JSON.parse(previous);
    refreshTimeline();
    refreshMediaLibrary();
    updateInspector();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(currentProject));
    const next = redoStack.pop();
    currentProject = JSON.parse(next);
    refreshTimeline();
    refreshMediaLibrary();
    updateInspector();
  }

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
    } else if (screenName === 'home') {
      renderRecentProjects();
    }
  }

  function setupNavigation() {
    navBtns.home.addEventListener('click', () => switchScreen('home'));
    navBtns.wizard.addEventListener('click', () => switchScreen('wizard'));
    navBtns.editor.addEventListener('click', () => switchScreen('editor'));

    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    document.getElementById('btn-save-project').addEventListener('click', () => {
      saveRecentProject(currentProject);
      const json = JSON.stringify(currentProject, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${currentProject.metadata.name || 'project'}.vcproj`;
      a.click();
    });
  }

  function populateSampleMedia() {
    // Add sample photos
    const sampleColors = [
      { name: 'sunset_photo.jpg', color: '#D97706', label: 'Sunset Adventure' },
      { name: 'mountain_view.jpg', color: '#2563EB', label: 'Mountain Peaks' },
      { name: 'portrait_girl.jpg', color: '#7C3AED', label: 'Portrait' },
      { name: 'city_skyline.jpg', color: '#059669', label: 'City Lights' }
    ];

    sampleColors.forEach((s, idx) => {
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const ctx = c.getContext('2d');
      ctx.fillStyle = s.color;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 64px Inter';
      ctx.fillText(s.label, 380, 380);
      const url = c.toDataURL('image/jpeg');

      currentProject.assets.push({ id: `sample-${idx}`, name: s.name, type: 'image', source: url });

      const clip = {
        id: `clip-video-${idx}`,
        name: s.name,
        startTime: idx * 3.5,
        duration: 3.5,
        source: url,
        motion: 'ZoomIn',
        cropMode: 'BlurBackground',
        transitionOut: { type: 'CrossDissolve', duration: 0.6 },
        transform: { rotationDegrees: -5.4, scaleX: 1.35, flipX: false, flipY: false, opacity: 1.0 },
        colorGrading: { exposure: 0.4, contrast: 60, saturation: 110 }
      };
      currentProject.timeline.tracks[0].clips.push(clip);
    });

    // Add Overlay Text
    currentProject.timeline.tracks[1].clips.push({
      id: 'clip-overlay-1',
      startTime: 0.5,
      duration: 5.0,
      overlay: {
        text: 'CAPTURING THE MAGIC OF THE SUNSET',
        fontFamily: 'Inter',
        fontSize: 52,
        colorHex: '#FFFFFF',
        backgroundColorHex: 'rgba(0,0,0,0.6)',
        entryAnimation: 'Pop',
        animationDuration: 0.6
      },
      transform: { anchorX: 0.5, anchorY: 0.85 }
    });

    // Add Sample Audio
    currentProject.assets.push({ id: 'sample-audio-1', name: 'Epic Journey.mp3', type: 'audio', source: '' });
    currentProject.timeline.tracks[2].clips.push({
      id: 'clip-audio-1',
      name: 'Epic Journey.mp3',
      startTime: 0,
      duration: 14.0,
      volume: 1.0
    });

    recalculateDuration();
    selectedClip = currentProject.timeline.tracks[0].clips[0];
  }

  // --- Home Screen & Recent Projects ---
  function setupHomeScreen() {
    document.getElementById('hero-quick-create').addEventListener('click', () => switchScreen('wizard'));
    document.getElementById('hero-blank-project').addEventListener('click', () => {
      pushHistory();
      currentProject = createDefaultProject('New Video Story', '16:9');
      selectedClip = null;
      switchScreen('editor');
    });

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
          <span class="badge" style="background:#1E293B; color:#94A3B8; padding:3px 6px; border-radius:4px; font-size:10px;">${t.aspectRatio}</span>
          <button class="btn btn-primary btn-sm">Use Template</button>
        </div>
      `;
      card.addEventListener('click', () => {
        applyTemplate(t);
        switchScreen('wizard');
      });
      container.appendChild(card);
    });

    renderRecentProjects();
  }

  function renderRecentProjects() {
    const recentSection = document.getElementById('home-recent-section');
    const recentGrid = document.getElementById('home-recent-grid');
    const recentList = getRecentProjects();

    if (recentList.length === 0) {
      recentSection.style.display = 'none';
      return;
    }

    recentSection.style.display = 'block';
    recentGrid.innerHTML = '';

    recentList.forEach((proj) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div style="font-size:24px;">🎞</div>
        <h4>${proj.metadata?.name || 'Untitled Project'}</h4>
        <p>Saved on ${new Date(proj.savedAt || Date.now()).toLocaleDateString()}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">
          <span class="badge" style="background:#1E293B; color:#94A3B8; padding:3px 6px; border-radius:4px; font-size:10px;">${proj.canvas?.width > proj.canvas?.height ? '16:9' : '9:16'}</span>
          <button class="btn btn-primary btn-sm">Open</button>
        </div>
      `;
      card.addEventListener('click', () => {
        pushHistory();
        currentProject = proj;
        currentTime = 0;
        selectedClip = null;
        switchScreen('editor');
      });
      recentGrid.appendChild(card);
    });
  }

  function getRecentProjects() {
    try {
      const raw = localStorage.getItem('vc_recent_projects');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRecentProject(proj) {
    try {
      const list = getRecentProjects().filter(p => p.metadata?.name !== proj.metadata?.name);
      proj.savedAt = Date.now();
      list.unshift(proj);
      if (list.length > 6) list.pop();
      localStorage.setItem('vc_recent_projects', JSON.stringify(list));
    } catch { }
  }

  function setupAutosaveAndRecovery() {
    try {
      const snapshot = localStorage.getItem('vc_autosave_snapshot');
      if (snapshot) {
        const banner = document.getElementById('recovery-banner');
        banner.style.display = 'flex';

        document.getElementById('btn-restore-recovery').addEventListener('click', () => {
          pushHistory();
          currentProject = JSON.parse(snapshot);
          banner.style.display = 'none';
          switchScreen('editor');
        });

        document.getElementById('btn-discard-recovery').addEventListener('click', () => {
          localStorage.removeItem('vc_autosave_snapshot');
          banner.style.display = 'none';
        });
      }
    } catch { }

    setInterval(() => {
      try {
        localStorage.setItem('vc_autosave_snapshot', JSON.stringify(currentProject));
      } catch { }
    }, 10000);
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

    document.getElementById('wizard-aspect-select').addEventListener('change', (e) => {
      wizardState.aspectRatio = e.target.value;
    });

    document.getElementById('wizard-generate-btn').addEventListener('click', () => {
      if (wizardState.photos.length === 0) {
        alert('Please upload at least 1 photo to create your video.');
        return;
      }
      pushHistory();
      currentProject = generateProjectFromWizard(wizardState);
      currentTime = 0;
      saveRecentProject(currentProject);
      switchScreen('editor');
    });
  }

  // --- Studio Editor ---
  function setupEditor() {
    document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('btn-step-backward').addEventListener('click', () => seek(currentTime - 1 / 30));
    document.getElementById('btn-step-forward').addEventListener('click', () => seek(currentTime + 1 / 30));

    document.getElementById('btn-split-clip').addEventListener('click', splitSelectedClip);
    document.getElementById('btn-delete-clip').addEventListener('click', deleteSelectedClip);

    document.getElementById('input-timeline-zoom').addEventListener('input', (e) => {
      timelineZoom = parseInt(e.target.value);
      refreshTimeline();
    });

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
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        if (e.shiftKey) redo(); else undo();
      }
    });

    document.getElementById('editor-aspect-select').addEventListener('change', (e) => {
      pushHistory();
      setAspectRatio(e.target.value);
    });

    document.getElementById('btn-open-export').addEventListener('click', () => {
      document.getElementById('export-modal').classList.add('active');
    });

    // Media uploads in editor
    const editorPhotoInput = document.getElementById('editor-photo-input');
    document.getElementById('editor-add-photo-btn').addEventListener('click', () => editorPhotoInput.click());
    editorPhotoInput.addEventListener('change', (e) => {
      pushHistory();
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
        pushHistory();
        const url = URL.createObjectURL(file);
        currentProject.assets.push({ id: `asset-audio-${Date.now()}`, name: file.name, type: 'audio', source: url });
        setProjectMusic(url, file.name);
        refreshMediaLibrary();
      }
    });

    document.getElementById('editor-add-text-btn').addEventListener('click', () => {
      pushHistory();
      addTextAtPlayhead('New Title', 'Inter', 48, '#FFFFFF');
    });

    // Populate Reels Templates Cards
    populateReelsTemplates();

    // Timeline Scrubbing
    const timelineArea = document.getElementById('timeline-tracks-area');
    timelineArea.addEventListener('click', (e) => {
      const rect = timelineArea.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineArea.scrollLeft;
      const sec = Math.max(0, clickX / timelineZoom);
      seek(sec);
    });
  }

  function populateReelsTemplates() {
    const list = document.getElementById('library-reels-list');
    list.innerHTML = '';
    window.VideoCreatorTemplates.forEach(t => {
      const card = document.createElement('div');
      card.className = 'reel-card-thumb';
      card.innerHTML = `
        <div style="font-size:16px;">📷</div>
        <div style="font-size:8px; margin-top:2px;">${t.name.split(' ')[0]}</div>
      `;
      card.title = `${t.name} (${t.aspectRatio})`;
      card.addEventListener('click', () => {
        pushHistory();
        applyStyleToAllClips(t);
      });
      list.appendChild(card);
    });
  }

  function applyStyleToAllClips(template) {
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      videoTrack.clips.forEach(c => {
        c.motion = template.motion || 'ZoomIn';
        c.cropMode = template.cropMode || 'BlurBackground';
        c.transitionOut = { type: template.transition || 'CrossDissolve', duration: template.transitionDuration || 0.5 };
      });
    }
    refreshTimeline();
    updateInspector();
  }

  function addTextAtPlayhead(text, fontFamily = 'Inter', fontSize = 48, colorHex = '#FFFFFF') {
    let overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
    if (!overlayTrack) {
      overlayTrack = { id: 'track-overlay-1', type: 'overlay', clips: [] };
      currentProject.timeline.tracks.push(overlayTrack);
    }

    const clip = {
      id: `clip-text-${Date.now()}`,
      startTime: currentTime,
      duration: 3.5,
      overlay: {
        text: text,
        fontFamily: fontFamily,
        fontSize: fontSize,
        colorHex: colorHex,
        backgroundColorHex: 'rgba(0,0,0,0.6)',
        entryAnimation: 'Pop',
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

  function setProjectMusic(url, trackName = 'Music Track') {
    audio.loadAudio(url);
    let audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio');
    if (!audioTrack) {
      audioTrack = { id: 'track-audio-1', type: 'audio', clips: [] };
      currentProject.timeline.tracks.push(audioTrack);
    }
    audioTrack.clips = [{
      id: `clip-audio-${Date.now()}`,
      name: trackName,
      startTime: 0,
      duration: currentProject.timeline.totalDuration || 14.0,
      source: url,
      volume: 1.0
    }];
    refreshTimeline();
  }

  // --- Inspector Setup ---
  function setupInspector() {
    document.getElementById('btn-rotate-left').addEventListener('click', () => rotateSelectedClip(-90));
    document.getElementById('btn-rotate-right').addEventListener('click', () => rotateSelectedClip(90));
    document.getElementById('btn-flip-h').addEventListener('click', () => toggleFlipSelectedClip('flipX'));
    document.getElementById('btn-flip-v').addEventListener('click', () => toggleFlipSelectedClip('flipY'));

    bindSlider('input-rotation-angle', 'val-rotation-angle', (val) => {
      if (selectedClip && selectedClip.transform) selectedClip.transform.rotationDegrees = parseFloat(val);
    }, '°');

    bindSlider('input-scale-zoom', 'val-scale-zoom', (val) => {
      if (selectedClip && selectedClip.transform) selectedClip.transform.scaleX = parseFloat(val);
    }, 'x');

    bindSlider('input-opacity', 'val-opacity', (val) => {
      if (selectedClip && selectedClip.transform) selectedClip.transform.opacity = parseFloat(val) / 100;
    }, '%');

    // Color Grading Sliders
    bindSlider('input-exposure', 'val-exposure', (val) => {
      if (selectedClip) {
        if (!selectedClip.colorGrading) selectedClip.colorGrading = {};
        selectedClip.colorGrading.exposure = parseFloat(val);
      }
    });

    bindSlider('input-contrast', 'val-contrast', (val) => {
      if (selectedClip) {
        if (!selectedClip.colorGrading) selectedClip.colorGrading = {};
        selectedClip.colorGrading.contrast = parseFloat(val);
      }
    });

    bindSlider('input-saturation', 'val-saturation', (val) => {
      if (selectedClip) {
        if (!selectedClip.colorGrading) selectedClip.colorGrading = {};
        selectedClip.colorGrading.saturation = parseFloat(val);
      }
    });

    // Master Volume
    document.getElementById('input-audio-master-vol').addEventListener('input', (e) => {
      audio.setVolume(parseFloat(e.target.value) / 100);
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
    pushHistory();
    selectedClip.transform.rotationDegrees = ((selectedClip.transform.rotationDegrees || 0) + delta) % 360;
    if (selectedClip.transform.rotationDegrees < -180) selectedClip.transform.rotationDegrees += 360;
    if (selectedClip.transform.rotationDegrees > 180) selectedClip.transform.rotationDegrees -= 360;
    updateInspector();
  }

  function toggleFlipSelectedClip(prop) {
    if (!selectedClip || !selectedClip.transform) return;
    pushHistory();
    selectedClip.transform[prop] = !selectedClip.transform[prop];
    updateInspector();
  }

  function updateInspector() {
    const textSec = document.getElementById('inspector-text-section');
    const titleLabel = document.getElementById('inspector-clip-title');

    if (!selectedClip) {
      titleLabel.textContent = 'NO CLIP SELECTED';
      textSec.style.display = 'none';
      return;
    }

    if (selectedClip.source) {
      titleLabel.textContent = (selectedClip.name || 'PHOTO CLIP').toUpperCase();
      textSec.style.display = 'none';

      const tf = selectedClip.transform || { rotationDegrees: 0, scaleX: 1.0, opacity: 1.0 };
      document.getElementById('input-rotation-angle').value = tf.rotationDegrees || 0;
      document.getElementById('val-rotation-angle').textContent = `${(tf.rotationDegrees || 0).toFixed(1)}°`;
      document.getElementById('input-scale-zoom').value = tf.scaleX || 1.0;
      document.getElementById('val-scale-zoom').textContent = `${Math.round((tf.scaleX || 1.0) * 100)}%`;
      document.getElementById('input-opacity').value = Math.round((tf.opacity !== undefined ? tf.opacity : 1.0) * 100);
      document.getElementById('val-opacity').textContent = `${Math.round((tf.opacity !== undefined ? tf.opacity : 1.0) * 100)}%`;

      const cg = selectedClip.colorGrading || { exposure: 0, contrast: 50, saturation: 100 };
      document.getElementById('input-exposure').value = cg.exposure || 0;
      document.getElementById('val-exposure').textContent = `${cg.exposure > 0 ? '+' : ''}${(cg.exposure || 0).toFixed(1)}`;
      document.getElementById('input-contrast').value = cg.contrast || 50;
      document.getElementById('val-contrast').textContent = `${cg.contrast || 50}`;
      document.getElementById('input-saturation').value = cg.saturation || 100;
      document.getElementById('val-saturation').textContent = `${cg.saturation || 100}`;
    } else if (selectedClip.overlay) {
      titleLabel.textContent = 'TITLES OVERLAY';
      textSec.style.display = 'block';
      const ov = selectedClip.overlay;
      document.getElementById('input-text-content').value = ov.text || '';
      document.getElementById('select-text-font').value = ov.fontFamily || 'Inter';
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
    const totalDur = currentProject.timeline.totalDuration || 14.0;
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

        const totalDur = currentProject.timeline.totalDuration || 14.0;
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
    const px = currentTime * timelineZoom;
    playhead.style.left = `${px + 90}px`; // Offset by track label width

    const mins = Math.floor(currentTime / 60);
    const secs = Math.floor(currentTime % 60);
    const frames = Math.floor((currentTime % 1) * 30);
    const tcStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;

    document.getElementById('editor-timecode').textContent = tcStr;
    document.getElementById('timeline-center-timecode').textContent = tcStr;
    document.getElementById('header-project-badge').textContent = `VideoCreator — ${currentProject.metadata.name || 'Project'} (${tcStr})`;
  }

  // --- Timeline Rendering ---
  function refreshTimeline() {
    const videoTrackArea = document.getElementById('timeline-video-track');
    const textTrackArea = document.getElementById('timeline-text-track');
    const audioTrackArea = document.getElementById('timeline-audio-track');
    const voiceoverArea = document.getElementById('timeline-voiceover-track');

    videoTrackArea.innerHTML = '';
    textTrackArea.innerHTML = '';
    audioTrackArea.innerHTML = '';
    voiceoverArea.innerHTML = '';

    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      videoTrack.clips.forEach(clip => {
        const block = createClipBlock(clip, 'clip-video', `🎞 ${clip.name || 'Photo'}`);
        videoTrackArea.appendChild(block);
      });
    }

    const overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
    if (overlayTrack) {
      overlayTrack.clips.forEach(clip => {
        const block = createClipBlock(clip, 'clip-text', `TITLES: ${clip.overlay?.text || 'Text'}`);
        textTrackArea.appendChild(block);
      });
    }

    const audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio');
    if (audioTrack) {
      audioTrack.clips.forEach(clip => {
        const block = createClipBlock(clip, 'clip-audio', `🎵 ${clip.name || 'Music'}`);
        audioTrackArea.appendChild(block);
      });
    }

    // Secondary Voiceover Mock Track
    const voBlock = document.createElement('div');
    voBlock.className = 'clip-block clip-audio';
    voBlock.style.left = `${3.0 * timelineZoom}px`;
    voBlock.style.width = `${5.0 * timelineZoom}px`;
    voBlock.style.opacity = '0.75';
    voBlock.textContent = '🎙 Voiceover';
    voiceoverArea.appendChild(voBlock);

    updatePlayheadPosition();
  }

  function createClipBlock(clip, className, label) {
    const div = document.createElement('div');
    div.className = `clip-block ${className} ${selectedClip === clip ? 'selected' : ''}`;
    div.style.left = `${clip.startTime * timelineZoom}px`;
    div.style.width = `${clip.duration * timelineZoom}px`;
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

    pushHistory();
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
    pushHistory();
    currentProject.timeline.tracks.forEach(t => {
      const idx = t.clips.indexOf(selectedClip);
      if (idx !== -1) {
        t.clips.splice(idx, 1);
      }
    });

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
    const visualTracks = currentProject.timeline.tracks.filter(t => t.type === 'video' || t.type === 'overlay');
    visualTracks.forEach(track => {
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

    const maxH = 460;
    const maxW = 740;

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
    // Photos Grid
    const photoList = document.getElementById('library-photos-list');
    photoList.innerHTML = '';
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    const timelineClips = videoTrack ? videoTrack.clips : [];

    currentProject.assets.filter(a => a.type === 'image').forEach(asset => {
      const isAdded = timelineClips.some(c => c.source === asset.source);

      const card = document.createElement('div');
      card.className = `photo-thumb-card ${isAdded ? 'selected' : ''}`;
      card.innerHTML = `
        <img src="${asset.source}">
        <div style="position:absolute; bottom:2px; left:4px; right:4px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:9px; background:rgba(0,0,0,0.7); padding:1px 4px; border-radius:3px; color:#FFF;">${asset.name.split('.')[0]}</span>
          <span style="font-size:9px; color:${isAdded ? '#10B981' : '#94A3B8'}; font-weight:bold;">${isAdded ? '✓' : '+'}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        pushHistory();
        if (isAdded) {
          if (videoTrack) {
            videoTrack.clips = videoTrack.clips.filter(c => c.source !== asset.source);
            let t = 0;
            videoTrack.clips.forEach(c => { c.startTime = t; t += c.duration; });
          }
        } else {
          insertPhotoAtPlayhead(asset.source, asset.name);
        }
        recalculateDuration();
        refreshTimeline();
        refreshMediaLibrary();
      });

      photoList.appendChild(card);
    });

    // Music List
    const musicList = document.getElementById('library-music-list');
    musicList.innerHTML = '';
    currentProject.assets.filter(a => a.type === 'audio').forEach(asset => {
      const item = document.createElement('div');
      item.className = 'music-preview-item';
      item.innerHTML = `
        <span style="font-size:11px; font-weight:600;">▶ ${asset.name}</span>
        <div class="waveform-preview-line"></div>
      `;
      musicList.appendChild(item);
    });
  }

  function insertPhotoAtPlayhead(src, name = 'Photo') {
    let videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (!videoTrack) {
      videoTrack = { id: 'track-video-1', type: 'video', clips: [] };
      currentProject.timeline.tracks.push(videoTrack);
    }
    const clip = {
      id: `clip-photo-${Date.now()}`,
      name: name,
      startTime: currentTime,
      duration: 3.5,
      source: src,
      motion: 'ZoomIn',
      cropMode: 'BlurBackground',
      transitionOut: { type: 'CrossDissolve', duration: 0.6 },
      transform: { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 },
      colorGrading: { exposure: 0, contrast: 50, saturation: 100 }
    };
    videoTrack.clips.push(clip);
    selectedClip = clip;
    recalculateDuration();
    refreshTimeline();
    updateInspector();
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
          progressLabel.textContent = `Encoding: ${p.percentage}% (${p.currentTime}s / ${p.totalDuration}s)`;
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

  function createDefaultProject(name, aspect = '16:9') {
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
    const durPerPhoto = state.template.photoDuration || 3.0;

    state.photos.forEach((photo, idx) => {
      proj.assets.push({ id: `asset-${idx}`, name: photo.name, type: 'image', source: photo.url });

      const clip = {
        id: `clip-video-${idx}`,
        name: photo.name,
        startTime: curTime,
        duration: durPerPhoto,
        source: photo.url,
        motion: state.template.motion || 'ZoomIn',
        cropMode: state.template.cropMode || 'BlurBackground',
        transitionOut: { type: state.template.transition || 'CrossDissolve', duration: state.template.transitionDuration || 0.5 },
        transform: { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 },
        colorGrading: { exposure: 0, contrast: 50, saturation: 100 }
      };

      proj.timeline.tracks[0].clips.push(clip);
      curTime += durPerPhoto;
    });

    if (state.template.suggestedTitle) {
      proj.timeline.tracks[1].clips.push({
        id: 'clip-title-1',
        startTime: 0.2,
        duration: Math.min(4.0, curTime),
        overlay: {
          text: state.template.suggestedTitle,
          fontFamily: 'Inter',
          fontSize: 52,
          colorHex: '#FFFFFF',
          backgroundColorHex: 'rgba(0,0,0,0.6)',
          entryAnimation: 'Pop',
          animationDuration: 0.6
        },
        transform: { anchorX: 0.5, anchorY: 0.85 }
      });
    }

    if (state.musicUrl) {
      proj.assets.push({ id: 'asset-music-1', name: state.musicFile?.name || 'Music Track', type: 'audio', source: state.musicUrl });
      proj.timeline.tracks[2].clips.push({
        id: 'clip-music-1',
        name: state.musicFile?.name || 'Music Track',
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

  window.addEventListener('DOMContentLoaded', init);
})();
