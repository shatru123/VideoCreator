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
    setupHeaderMenu();
    setupKeyboardShortcuts();
    setupHelpModals();
    setupMobileDrawerAndTabs();
    setupHomeScreen();
    setupWizard();
    setupEditor();
    setupInspector();
    setupExportModal();
    setupVoiceoverModal();
    setupSafeZonesAndCoverExport();
    setupAutosaveAndRecovery();

    // Populate initial sample content
    populateSampleMedia();

    // Default to Home Screen
    switchScreen('home');

    // Canvas render initial frame
    requestRender();

    // Handle responsive resize and orientation change
    window.addEventListener('resize', () => {
      resizeCanvasWrapper();
      requestRender();
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        resizeCanvasWrapper();
        requestRender();
      }, 150);
    });
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
    requestRender();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(currentProject));
    const next = redoStack.pop();
    currentProject = JSON.parse(next);
    refreshTimeline();
    refreshMediaLibrary();
    updateInspector();
    requestRender();
  }

  function switchScreen(screenName) {
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === screenName);
    });
    Object.keys(navBtns).forEach(key => {
      if (navBtns[key]) navBtns[key].classList.toggle('active', key === screenName);
    });

    closeMobileDrawer();
    closeBottomSheets();
    closeAllDropdowns();

    if (screenName === 'editor') {
      refreshTimeline();
      refreshMediaLibrary();
      updateInspector();
      resizeCanvasWrapper();
      requestRender();
    } else if (screenName === 'home') {
      renderRecentProjects();
    }
  }

  function setupNavigation() {
    navBtns.home?.addEventListener('click', () => switchScreen('home'));
    navBtns.wizard?.addEventListener('click', () => switchScreen('wizard'));
    navBtns.editor?.addEventListener('click', () => switchScreen('editor'));

    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);

    document.getElementById('btn-save-project')?.addEventListener('click', saveProjectFile);
  }

  function saveProjectFile() {
    saveRecentProject(currentProject);
    const json = JSON.stringify(currentProject, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentProject.metadata.name || 'project'}.vcproj`;
    a.click();
  }

  // --- Workable Top Header Menu Bar (File, Edit, Media, View, Window, Help) ---
  function setupHeaderMenu() {
    const dropdowns = document.querySelectorAll('.menu-dropdown');

    dropdowns.forEach(dropdown => {
      const trigger = dropdown.querySelector('.menu-dropdown-trigger');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasActive = dropdown.classList.contains('active');
        closeAllDropdowns();
        if (!wasActive) dropdown.classList.add('active');
      });

      trigger.addEventListener('mouseenter', () => {
        const anyOpen = Array.from(dropdowns).some(d => d.classList.contains('active'));
        if (anyOpen) {
          closeAllDropdowns();
          dropdown.classList.add('active');
        }
      });
    });

    window.addEventListener('click', () => {
      closeAllDropdowns();
    });

    // 1. FILE MENU ACTIONS
    document.getElementById('menu-file-new')?.addEventListener('click', () => {
      closeAllDropdowns();
      if (confirm('Create a new project? Unsaved changes in the current project will be replaced.')) {
        discardCurrentSession();
        currentProject = createDefaultProject('My New Video', '16:9');
        switchScreen('editor');
        refreshTimeline();
        refreshMediaLibrary();
        updateInspector();
        requestRender();
      }
    });

    const openInput = document.getElementById('menu-open-project-input');
    document.getElementById('menu-file-open')?.addEventListener('click', () => {
      closeAllDropdowns();
      openInput?.click();
    });

    openInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (parsed.canvas && parsed.timeline) {
            pushHistory();
            currentProject = parsed;
            currentTime = 0;
            selectedClip = null;
            switchScreen('editor');
            refreshTimeline();
            refreshMediaLibrary();
            updateInspector();
            requestRender();
            alert(`📂 Project "${currentProject.metadata?.name || 'Project'}" opened successfully!`);
          } else {
            alert('Invalid project file structure.');
          }
        } catch (err) {
          alert('Could not parse project file: ' + err.message);
        }
      };
      reader.readAsText(file);
      openInput.value = '';
    });

    document.getElementById('menu-file-save')?.addEventListener('click', () => {
      closeAllDropdowns();
      saveProjectFile();
    });

    document.getElementById('menu-file-save-as')?.addEventListener('click', () => {
      closeAllDropdowns();
      const newName = prompt('Enter project name:', currentProject.metadata?.name || 'My Project');
      if (newName) {
        currentProject.metadata.name = newName;
        saveProjectFile();
      }
    });

    document.getElementById('menu-file-import-photo')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('editor-photo-input')?.click();
    });

    document.getElementById('menu-file-import-audio')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('editor-music-input')?.click();
    });

    document.getElementById('menu-file-export')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('export-modal')?.classList.add('active');
    });

    document.getElementById('menu-file-home')?.addEventListener('click', () => {
      closeAllDropdowns();
      switchScreen('home');
    });

    // 2. EDIT MENU ACTIONS
    document.getElementById('menu-edit-undo')?.addEventListener('click', () => { closeAllDropdowns(); undo(); });
    document.getElementById('menu-edit-redo')?.addEventListener('click', () => { closeAllDropdowns(); redo(); });
    document.getElementById('menu-edit-split')?.addEventListener('click', () => { closeAllDropdowns(); splitSelectedClip(); });
    
    document.getElementById('menu-edit-duplicate')?.addEventListener('click', () => {
      closeAllDropdowns();
      if (!selectedClip) { alert('Select a clip on the timeline first to duplicate.'); return; }
      pushHistory();
      const track = currentProject.timeline.tracks.find(t => t.clips.includes(selectedClip));
      if (track) {
        const cloned = JSON.parse(JSON.stringify(selectedClip));
        cloned.id = `clip-dup-${Date.now()}`;
        cloned.startTime = currentProject.timeline.totalDuration;
        track.clips.push(cloned);
        selectedClip = cloned;
        recalculateDuration();
        refreshTimeline();
        updateInspector();
        requestRender();
      }
    });

    document.getElementById('menu-edit-delete')?.addEventListener('click', () => { closeAllDropdowns(); deleteSelectedClip(); });

    document.getElementById('menu-edit-reset-transform')?.addEventListener('click', () => {
      closeAllDropdowns();
      if (selectedClip && selectedClip.transform) {
        pushHistory();
        selectedClip.transform = { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 };
        updateInspector();
        requestRender();
      }
    });

    document.getElementById('menu-edit-clear-all')?.addEventListener('click', () => {
      closeAllDropdowns();
      if (confirm('Clear all clips from the timeline?')) {
        pushHistory();
        currentProject.timeline.tracks.forEach(t => t.clips = []);
        selectedClip = null;
        recalculateDuration();
        refreshTimeline();
        updateInspector();
        requestRender();
      }
    });

    // 3. MEDIA MENU ACTIONS
    document.getElementById('menu-media-add-photos')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('editor-photo-input')?.click();
    });

    document.getElementById('menu-media-add-audio')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('editor-music-input')?.click();
    });

    document.getElementById('menu-media-beat-sync')?.addEventListener('click', () => {
      closeAllDropdowns();
      autoBeatSyncPhotos();
    });

    document.getElementById('menu-media-apply-motion-all')?.addEventListener('click', () => {
      closeAllDropdowns();
      const motion = selectedClip?.motion || 'ZoomIn';
      pushHistory();
      const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
      if (videoTrack) {
        videoTrack.clips.forEach(c => c.motion = motion);
        alert(`✨ Applied "${motion}" motion to all photos!`);
      }
    });

    document.getElementById('menu-media-apply-filter-all')?.addEventListener('click', () => {
      closeAllDropdowns();
      const filter = selectedClip?.filterPreset || 'cinematic';
      pushHistory();
      const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
      if (videoTrack) {
        videoTrack.clips.forEach(c => c.filterPreset = filter);
        alert(`🎨 Applied "${filter}" color grade to all photos!`);
        requestRender();
      }
    });

    document.getElementById('menu-media-add-title')?.addEventListener('click', () => {
      closeAllDropdowns();
      pushHistory();
      let overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
      if (!overlayTrack) {
        overlayTrack = { id: 'track-overlay-1', type: 'overlay', clips: [] };
        currentProject.timeline.tracks.push(overlayTrack);
      }
      overlayTrack.clips.push({
        id: `clip-title-${Date.now()}`,
        startTime: currentTime,
        duration: 3.5,
        overlay: {
          text: 'NEW TITLE OVERLAY',
          fontFamily: 'Inter',
          fontSize: 54,
          colorHex: '#FFFFFF',
          entryAnimation: 'Pop',
          animationDuration: 0.6
        },
        transform: { anchorX: 0.5, anchorY: 0.85 }
      });
      recalculateDuration();
      refreshTimeline();
      requestRender();
    });

    // 4. VIEW MENU ACTIONS
    document.getElementById('menu-view-aspect-16-9')?.addEventListener('click', () => { closeAllDropdowns(); setAspectRatio('16:9'); });
    document.getElementById('menu-view-aspect-9-16')?.addEventListener('click', () => { closeAllDropdowns(); setAspectRatio('9:16'); });
    document.getElementById('menu-view-aspect-1-1')?.addEventListener('click', () => { closeAllDropdowns(); setAspectRatio('1:1'); });

    document.getElementById('menu-view-zoom-in')?.addEventListener('click', () => {
      closeAllDropdowns();
      timelineZoom = Math.min(200, timelineZoom + 20);
      refreshTimeline();
    });

    document.getElementById('menu-view-zoom-out')?.addEventListener('click', () => {
      closeAllDropdowns();
      timelineZoom = Math.max(30, timelineZoom - 20);
      refreshTimeline();
    });

    document.getElementById('menu-view-zoom-fit')?.addEventListener('click', () => {
      closeAllDropdowns();
      const tracksArea = document.getElementById('timeline-tracks-area');
      const totalDur = currentProject.timeline.totalDuration || 14.0;
      if (tracksArea && totalDur > 0) {
        timelineZoom = Math.max(30, Math.min(200, (tracksArea.clientWidth - 120) / totalDur));
        refreshTimeline();
      }
    });

    document.getElementById('menu-view-fullscreen')?.addEventListener('click', () => {
      closeAllDropdowns();
      toggleFullscreenPreview();
    });

    // 5. WINDOW MENU ACTIONS
    document.getElementById('menu-window-home')?.addEventListener('click', () => { closeAllDropdowns(); switchScreen('home'); });
    document.getElementById('menu-window-wizard')?.addEventListener('click', () => { closeAllDropdowns(); switchScreen('wizard'); });
    document.getElementById('menu-window-editor')?.addEventListener('click', () => { closeAllDropdowns(); switchScreen('editor'); });

    document.getElementById('menu-window-media')?.addEventListener('click', () => {
      closeAllDropdowns();
      switchScreen('editor');
      if (window.innerWidth < 768) openBottomSheet('media');
    });

    document.getElementById('menu-window-inspector')?.addEventListener('click', () => {
      closeAllDropdowns();
      switchScreen('editor');
      if (window.innerWidth < 768) openBottomSheet('inspector');
    });

    document.getElementById('menu-window-filters')?.addEventListener('click', () => {
      closeAllDropdowns();
      switchScreen('editor');
      openBottomSheet('filters');
    });

    document.getElementById('menu-window-audio')?.addEventListener('click', () => {
      closeAllDropdowns();
      switchScreen('editor');
      openBottomSheet('audio');
    });

    document.getElementById('menu-window-export')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('export-modal')?.classList.add('active');
    });

    // 6. HELP MENU ACTIONS
    document.getElementById('menu-help-shortcuts')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('shortcuts-modal')?.classList.add('active');
    });

    document.getElementById('menu-help-guide')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('guide-modal')?.classList.add('active');
    });

    document.getElementById('menu-help-about')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('about-modal')?.classList.add('active');
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('active'));
  }

  // --- Help & Shortcut Modals Setup ---
  function setupHelpModals() {
    document.getElementById('btn-close-shortcuts')?.addEventListener('click', () => {
      document.getElementById('shortcuts-modal')?.classList.remove('active');
    });
    document.getElementById('btn-ok-shortcuts')?.addEventListener('click', () => {
      document.getElementById('shortcuts-modal')?.classList.remove('active');
    });

    document.getElementById('btn-close-guide')?.addEventListener('click', () => {
      document.getElementById('guide-modal')?.classList.remove('active');
    });
    document.getElementById('btn-ok-guide')?.addEventListener('click', () => {
      document.getElementById('guide-modal')?.classList.remove('active');
    });

    document.getElementById('btn-close-about')?.addEventListener('click', () => {
      document.getElementById('about-modal')?.classList.remove('active');
    });
    document.getElementById('btn-ok-about')?.addEventListener('click', () => {
      document.getElementById('about-modal')?.classList.remove('active');
    });
  }

  // --- Global Keyboard Shortcuts ---
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveProjectFile();
      } else if (isCtrlOrCmd && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        document.getElementById('export-modal')?.classList.add('active');
      } else if (e.key === 's' || e.key === 'S') {
        splitSelectedClip();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedClip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(currentTime - (e.shiftKey ? 1.0 : 1 / 30));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seek(currentTime + (e.shiftKey ? 1.0 : 1 / 30));
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreenPreview();
      } else if (e.key === 'Escape') {
        closeAllDropdowns();
        closeBottomSheets();
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      }
    });
  }

  // --- Mobile Navigation Drawer & Bottom Sheet Controller ---
  function setupMobileDrawerAndTabs() {
    const menuBtn = document.getElementById('btn-mobile-menu');
    const drawer = document.getElementById('mobile-drawer');
    const drawerOverlay = document.getElementById('mobile-drawer-overlay');
    const closeDrawerBtn = document.getElementById('btn-close-drawer');

    // Open/Close Drawer
    menuBtn?.addEventListener('click', () => {
      drawer?.classList.add('active');
      drawerOverlay?.classList.add('active');
    });

    closeDrawerBtn?.addEventListener('click', closeMobileDrawer);
    drawerOverlay?.addEventListener('click', closeMobileDrawer);

    // Mobile Drawer Navigation
    document.getElementById('mobile-nav-home')?.addEventListener('click', () => switchScreen('home'));
    document.getElementById('mobile-nav-wizard')?.addEventListener('click', () => switchScreen('wizard'));
    document.getElementById('mobile-nav-editor')?.addEventListener('click', () => switchScreen('editor'));

    // Mobile Aspect Ratio Selectors
    document.getElementById('btn-mobile-aspect-16-9')?.addEventListener('click', () => { setAspectRatio('16:9'); closeMobileDrawer(); });
    document.getElementById('btn-mobile-aspect-9-16')?.addEventListener('click', () => { setAspectRatio('9:16'); closeMobileDrawer(); });
    document.getElementById('btn-mobile-aspect-1-1')?.addEventListener('click', () => { setAspectRatio('1:1'); closeMobileDrawer(); });

    // Mobile Quick Actions
    document.getElementById('btn-mobile-save')?.addEventListener('click', () => { saveProjectFile(); closeMobileDrawer(); });
    document.getElementById('btn-mobile-export')?.addEventListener('click', () => {
      closeMobileDrawer();
      document.getElementById('export-modal')?.classList.add('active');
    });
    document.getElementById('btn-mobile-undo')?.addEventListener('click', () => { undo(); closeMobileDrawer(); });
    document.getElementById('btn-mobile-redo')?.addEventListener('click', () => { redo(); closeMobileDrawer(); });

    // Mobile Bottom Tab Bar in Studio Editor
    const tabButtons = document.querySelectorAll('.mobile-tab-btn[data-sheet]');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const sheetName = btn.getAttribute('data-sheet');
        openBottomSheet(sheetName);
      });
    });

    document.getElementById('btn-mobile-quick-export')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('active');
    });

    // Close buttons on all bottom sheets
    document.querySelectorAll('.btn-close-sheet').forEach(btn => {
      btn.addEventListener('click', closeBottomSheets);
    });

    const sheetOverlay = document.getElementById('mobile-sheet-overlay');
    sheetOverlay?.addEventListener('click', closeBottomSheets);

    // Mobile Action Sheet Buttons
    document.getElementById('action-btn-inspect')?.addEventListener('click', () => {
      closeBottomSheets();
      openBottomSheet('inspector');
    });
    document.getElementById('action-btn-animation')?.addEventListener('click', () => {
      closeBottomSheets();
      openBottomSheet('inspector');
    });
    document.getElementById('action-btn-split')?.addEventListener('click', () => {
      closeBottomSheets();
      splitSelectedClip();
    });
    document.getElementById('action-btn-copy-anim')?.addEventListener('click', () => {
      closeBottomSheets();
      if (selectedClip) {
        window._copiedMotion = selectedClip.motion || 'ZoomIn';
      }
    });
    document.getElementById('action-btn-reorder-left')?.addEventListener('click', () => {
      moveSelectedClip(-1);
    });
    document.getElementById('action-btn-reorder-right')?.addEventListener('click', () => {
      moveSelectedClip(1);
    });
    document.getElementById('action-btn-delete')?.addEventListener('click', () => {
      closeBottomSheets();
      deleteSelectedClip();
    });

    // Fullscreen Toggle Button
    document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', toggleFullscreenPreview);

    // Mobile Add Media in Sheet
    document.getElementById('mobile-add-photo-btn')?.addEventListener('click', () => {
      document.getElementById('editor-photo-input')?.click();
    });
    document.getElementById('mobile-add-music-btn')?.addEventListener('click', () => {
      document.getElementById('editor-music-input')?.click();
    });
  }

  function closeMobileDrawer() {
    document.getElementById('mobile-drawer')?.classList.remove('active');
    document.getElementById('mobile-drawer-overlay')?.classList.remove('active');
  }

  function openBottomSheet(sheetName) {
    closeBottomSheets();
    const sheet = document.getElementById(`mobile-sheet-${sheetName}`);
    const overlay = document.getElementById('mobile-sheet-overlay');
    if (!sheet) return;

    // Update active tab in bottom bar
    document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-sheet') === sheetName);
    });

    // Sync content into sheet
    if (sheetName === 'media') {
      populateMobileMediaSheet();
    } else if (sheetName === 'inspector') {
      populateMobileInspectorSheet();
    } else if (sheetName === 'filters') {
      populateMobileFiltersSheet();
    } else if (sheetName === 'audio') {
      populateMobileAudioSheet();
    } else if (sheetName === 'stickers') {
      populateMobileStickersSheet();
    } else if (sheetName === 'styles') {
      populateMobileStylesSheet();
    } else if (sheetName === 'titles') {
      populateMobileTitlesSheet();
    }

    sheet.classList.add('active');
    overlay?.classList.add('active');
  }

  function closeBottomSheets() {
    document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
    document.getElementById('mobile-sheet-overlay')?.classList.remove('active');
  }

  function toggleFullscreenPreview() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!document.fullscreenElement) {
      if (wrapper.requestFullscreen) wrapper.requestFullscreen();
      else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  function populateMobileMediaSheet() {
    const container = document.getElementById('mobile-media-content');
    if (!container) return;
    container.innerHTML = '';

    // Photos Section
    const photoSec = document.createElement('div');
    photoSec.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#94A3B8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <span>📁 Photos Library</span>
        <span style="font-size:11px; color:#60A5FA;">Tap to Add / Remove</span>
      </div>
      <div id="mobile-library-photos" class="photos-grid-view" style="max-height:240px;"></div>
    `;
    container.appendChild(photoSec);

    // Render photo thumbs with clear green 'In Timeline' and red 'Remove' buttons
    const grid = photoSec.querySelector('#mobile-library-photos');
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    const timelineClips = videoTrack ? videoTrack.clips : [];

    currentProject.assets.filter(a => a.type === 'image').forEach(asset => {
      const isAdded = timelineClips.some(c => c.source === asset.source);
      const card = document.createElement('div');
      card.className = `photo-thumb-card ${isAdded ? 'selected' : ''}`;
      card.style.position = 'relative';
      card.innerHTML = `
        <img src="${asset.source}">
        <div style="position:absolute; top:4px; right:4px;">
          ${isAdded 
            ? '<span style="background:#10B981; color:#000; font-size:9px; font-weight:900; padding:2px 6px; border-radius:10px;">✓ IN TIMELINE</span>'
            : '<span style="background:rgba(0,0,0,0.7); color:#94A3B8; font-size:9px; font-weight:700; padding:2px 6px; border-radius:10px;">+ NOT ADDED</span>'}
        </div>
        <div style="position:absolute; bottom:4px; left:4px; right:4px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.85); padding:3px 6px; border-radius:4px;">
          <span style="font-size:10px; font-weight:700; color:#FFF; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80px;">${asset.name.split('.')[0]}</span>
          <button class="btn btn-sm ${isAdded ? 'btn-danger' : 'btn-primary'}" style="padding:2px 8px; font-size:10px; min-height:22px;">
            ${isAdded ? '− Remove' : '+ Insert'}
          </button>
        </div>
      `;

      card.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
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
        populateMobileMediaSheet();
        requestRender();
      });

      grid.appendChild(card);
    });

    // Music Section
    const musicSec = document.createElement('div');
    musicSec.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#94A3B8; margin-top:10px; margin-bottom:8px;">🎵 Audio Tracks in Project</div>
      <div id="mobile-library-music" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;
    container.appendChild(musicSec);

    const mList = musicSec.querySelector('#mobile-library-music');
    currentProject.assets.filter(a => a.type === 'audio').forEach(asset => {
      const item = document.createElement('div');
      item.className = 'music-preview-item';
      item.innerHTML = `
        <span style="font-size:12px; font-weight:700; color:#FEF3C7;">▶ ${asset.name}</span>
        <div class="waveform-preview-line"></div>
      `;
      mList.appendChild(item);
    });
  }

  function populateMobileInspectorSheet() {
    const container = document.getElementById('mobile-inspector-content');
    if (!container) return;
    container.innerHTML = '';

    if (!selectedClip) {
      container.innerHTML = `<div style="text-align:center; color:#94A3B8; padding:30px 10px;">Tap any clip on the timeline below to inspect and customize it.</div>`;
      return;
    }

    const title = document.getElementById('mobile-inspector-title');
    if (title) title.textContent = `🎛 ${(selectedClip.name || 'Clip').toUpperCase()}`;

    if (selectedClip.source) {
      const tf = selectedClip.transform || { rotationDegrees: 0, scaleX: 1.0, opacity: 1.0 };

      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <!-- Transform -->
          <div class="inspector-section-title">TRANSFORM &amp; ROTATION</div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px;">
            <button id="m-btn-rot-left" class="btn btn-secondary" style="min-height:44px;">↺ -90°</button>
            <button id="m-btn-rot-right" class="btn btn-secondary" style="min-height:44px;">↻ +90°</button>
            <button id="m-btn-flip-h" class="btn btn-secondary" style="min-height:44px;">⇄ Flip H</button>
            <button id="m-btn-flip-v" class="btn btn-secondary" style="min-height:44px;">⇅ Flip V</button>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:12px; color:#94A3B8;">Scale / Zoom</label>
            <span id="m-val-scale" style="font-size:12px; color:#FFF; font-weight:800;">${Math.round((tf.scaleX || 1.0) * 100)}%</span>
          </div>
          <input type="range" id="m-input-scale" min="0.5" max="2.5" step="0.05" value="${tf.scaleX || 1.0}" style="height:34px;">

          <!-- Animation Suite -->
          <div class="inspector-section-title" style="margin-top:6px;">PHOTO CAMERA MOTION</div>
          <select id="m-select-motion" class="btn btn-secondary" style="width:100%; min-height:44px; font-size:12px; font-weight:700;">
            <option value="ZoomIn">🔍 Zoom In (Focus Target)</option>
            <option value="ZoomOut">🔍 Zoom Out (Reveal Scene)</option>
            <option value="ZoomInOut">🔍 Zoom In then Out</option>
            <option value="PanLeft">⬅ Pan Left</option>
            <option value="PanRight">➡ Pan Right</option>
            <option value="PanUp">⬆ Pan Up</option>
            <option value="PanDown">⬇ Pan Down</option>
            <option value="KenBurns">🎬 Ken Burns Cinematic</option>
            <option value="DynamicZoom">⚡ Dynamic Zoom &amp; Drift</option>
            <option value="Cinematic">🎥 Cinematic Multi-Keyframe</option>
            <option value="DiagonalUpLeft">↗ Diagonal Drift</option>
            <option value="RandomMotion">🎲 Random Dynamic Motion</option>
          </select>

          <!-- Duration Setting -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
            <label style="font-size:12px; color:#94A3B8;">Photo Duration</label>
            <span id="m-val-dur" style="font-size:13px; color:#60A5FA; font-weight:900;">${selectedClip.duration.toFixed(1)}s</span>
          </div>
          <input type="range" id="m-input-dur" min="0.5" max="15" step="0.5" value="${selectedClip.duration}" style="height:34px;">

          <!-- Actions -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
            <button id="m-btn-apply-all" class="btn btn-secondary" style="min-height:44px;">✨ Apply to All</button>
            <button id="m-btn-del-clip" class="btn btn-danger" style="min-height:44px;">🗑 Delete Clip</button>
          </div>
        </div>
      `;

      // Bind events
      container.querySelector('#m-select-motion').value = selectedClip.motion || 'ZoomIn';
      container.querySelector('#m-select-motion').addEventListener('change', (e) => {
        pushHistory();
        selectedClip.motion = e.target.value;
        refreshTimeline();
        requestRender();
      });

      container.querySelector('#m-btn-rot-left').addEventListener('click', () => {
        pushHistory();
        selectedClip.transform = selectedClip.transform || {};
        selectedClip.transform.rotationDegrees = (selectedClip.transform.rotationDegrees || 0) - 90;
        updateInspector();
        requestRender();
      });
      container.querySelector('#m-btn-rot-right').addEventListener('click', () => {
        pushHistory();
        selectedClip.transform = selectedClip.transform || {};
        selectedClip.transform.rotationDegrees = (selectedClip.transform.rotationDegrees || 0) + 90;
        updateInspector();
        requestRender();
      });
      container.querySelector('#m-btn-flip-h').addEventListener('click', () => {
        pushHistory();
        selectedClip.transform = selectedClip.transform || {};
        selectedClip.transform.flipX = !selectedClip.transform.flipX;
        updateInspector();
        requestRender();
      });
      container.querySelector('#m-btn-flip-v').addEventListener('click', () => {
        pushHistory();
        selectedClip.transform = selectedClip.transform || {};
        selectedClip.transform.flipY = !selectedClip.transform.flipY;
        updateInspector();
        requestRender();
      });

      const scaleInput = container.querySelector('#m-input-scale');
      scaleInput.addEventListener('input', (e) => {
        selectedClip.transform = selectedClip.transform || {};
        selectedClip.transform.scaleX = parseFloat(e.target.value);
        container.querySelector('#m-val-scale').textContent = `${Math.round(selectedClip.transform.scaleX * 100)}%`;
        updateInspector();
        requestRender();
      });

      const durInput = container.querySelector('#m-input-dur');
      durInput.addEventListener('input', (e) => {
        pushHistory();
        selectedClip.duration = parseFloat(e.target.value);
        container.querySelector('#m-val-dur').textContent = `${selectedClip.duration.toFixed(1)}s`;
        const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
        if (videoTrack) {
          let t = 0;
          videoTrack.clips.forEach(c => { c.startTime = t; t += c.duration; });
        }
        recalculateDuration();
        refreshTimeline();
        requestRender();
      });

      container.querySelector('#m-btn-apply-all').addEventListener('click', () => {
        pushHistory();
        const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
        if (videoTrack) {
          videoTrack.clips.forEach(c => { c.motion = selectedClip.motion; });
        }
        alert('✨ Applied camera motion to all photos!');
      });

      container.querySelector('#m-btn-del-clip').addEventListener('click', () => {
        deleteSelectedClip();
        closeBottomSheets();
        requestRender();
      });
    }
  }

  // --- Real-time Filters & Cinematic LUTs Sheet ---
  function populateMobileFiltersSheet() {
    const container = document.getElementById('mobile-filters-content');
    if (!container) return;
    container.innerHTML = '';

    const FILTER_PRESETS = [
      { id: 'none', name: 'Original', desc: 'Natural color', gradient: 'linear-gradient(135deg, #374151, #1F2937)' },
      { id: 'cinematic', name: 'Cinematic 35mm', desc: 'Warm contrast & filmic shadows', gradient: 'linear-gradient(135deg, #78350F, #1E1B4B)' },
      { id: 'teal-orange', name: 'Teal & Orange', desc: 'Blockbuster color grade', gradient: 'linear-gradient(135deg, #0E7490, #C2410C)' },
      { id: 'sunset', name: 'Sunset Glow', desc: 'Golden hour radiance', gradient: 'linear-gradient(135deg, #B45309, #BE123C)' },
      { id: 'vintage', name: 'Vintage 70s', desc: 'Nostalgic sepia film', gradient: 'linear-gradient(135deg, #713F12, #451A03)' },
      { id: 'noir', name: 'Noir B&W', desc: 'High contrast monochrome', gradient: 'linear-gradient(135deg, #000000, #4B5563)' },
      { id: 'vibrant', name: 'Vibrant Vivid', desc: 'Punchy saturated colors', gradient: 'linear-gradient(135deg, #15803D, #0284C7)' },
      { id: 'cyberpunk', name: 'Cyberpunk Neon', desc: 'Ultraviolet & magenta glow', gradient: 'linear-gradient(135deg, #701A75, #4338CA)' }
    ];

    const currentFilter = selectedClip?.filterPreset || 'none';

    const grid = document.createElement('div');
    grid.className = 'filters-grid';

    FILTER_PRESETS.forEach(f => {
      const card = document.createElement('div');
      card.className = `filter-card ${currentFilter === f.id ? 'active' : ''}`;
      card.innerHTML = `
        <div class="filter-swatch" style="background:${f.gradient}; color:#FFF;">🎨</div>
        <div class="filter-title">${f.name}</div>
        <div style="font-size:9px; color:#94A3B8; text-align:center;">${f.desc}</div>
      `;

      card.addEventListener('click', () => {
        pushHistory();
        if (selectedClip) {
          selectedClip.filterPreset = f.id;
        } else {
          // Apply to all clips on video track
          const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
          if (videoTrack) {
            videoTrack.clips.forEach(c => { c.filterPreset = f.id; });
          }
        }
        populateMobileFiltersSheet();
        requestRender();
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);

    // Apply to all button
    const applyAllBtn = document.createElement('button');
    applyAllBtn.className = 'btn btn-secondary';
    applyAllBtn.style.marginTop = '10px';
    applyAllBtn.style.width = '100%';
    applyAllBtn.textContent = '✨ Apply Filter to All Photos';
    applyAllBtn.addEventListener('click', () => {
      pushHistory();
      const activeFilter = selectedClip?.filterPreset || 'cinematic';
      const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
      if (videoTrack) {
        videoTrack.clips.forEach(c => { c.filterPreset = activeFilter; });
      }
      alert('✨ Applied filter to all photos in project!');
      requestRender();
    });
    container.appendChild(applyAllBtn);
  }

  // --- Audio Trimmer & Beat Sync Sheet ---
  function populateMobileAudioSheet() {
    const container = document.getElementById('mobile-audio-content');
    if (!container) return;
    container.innerHTML = '';

    const audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio');
    const audioClip = audioTrack?.clips[0];

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Magic Beat Sync Button -->
        <button id="m-btn-beat-sync" class="btn btn-beat-sync" style="width:100%;">
          ⚡ Magic Beat Sync &amp; Auto-Cut Photos
        </button>

        <!-- Audio Track Info -->
        <div class="audio-trimmer-container">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:12px; font-weight:700; color:#FEF3C7;">🎵 ${audioClip?.name || 'Background Music'}</span>
            <span style="font-size:11px; color:#94A3B8;">Duration: ${(audioClip?.duration || 14).toFixed(1)}s</span>
          </div>

          <div style="height:36px; background:#1E2433; border-radius:6px; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;">
            <div class="waveform-preview-line" style="width:90%;"></div>
          </div>
        </div>

        <!-- Audio Volume -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label style="font-size:12px; color:#94A3B8;">Music Volume</label>
            <span id="m-val-vol" style="font-size:12px; font-weight:700; color:#FFF;">${Math.round((audioClip?.volume || 1.0) * 100)}%</span>
          </div>
          <input type="range" id="m-input-vol" min="0" max="1.5" step="0.05" value="${audioClip?.volume || 1.0}" style="width:100%; height:34px;">
        </div>

        <!-- Audio Fades -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:11px; color:#94A3B8;">Fade In (sec)</label>
            <input type="number" id="m-input-fade-in" class="btn btn-secondary" style="width:100%; min-height:40px; margin-top:4px;" value="1.0" min="0" max="5" step="0.5">
          </div>
          <div>
            <label style="font-size:11px; color:#94A3B8;">Fade Out (sec)</label>
            <input type="number" id="m-input-fade-out" class="btn btn-secondary" style="width:100%; min-height:40px; margin-top:4px;" value="1.5" min="0" max="5" step="0.5">
          </div>
        </div>
      </div>
    `;

    // Magic Beat Sync Handler
    container.querySelector('#m-btn-beat-sync')?.addEventListener('click', () => {
      pushHistory();
      autoBeatSyncPhotos();
    });

    const volInput = container.querySelector('#m-input-vol');
    volInput?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (audioClip) audioClip.volume = v;
      container.querySelector('#m-val-vol').textContent = `${Math.round(v * 100)}%`;
      audio.setVolume(v);
    });

    // Stock Music Tracks Library
    const stockSec = document.createElement('div');
    stockSec.style.marginTop = '8px';
    stockSec.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#38BDF8; margin-bottom:8px;">🎵 Royalty-Free Music Library (1-Click)</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button class="btn btn-secondary btn-stock-music" data-track="lofi" style="justify-content:space-between; text-align:left; min-height:40px;">
          <span>☕ Sunset Chill Lo-Fi</span><span style="font-size:10px; color:#60A5FA;">+ Insert</span>
        </button>
        <button class="btn btn-secondary btn-stock-music" data-track="pop" style="justify-content:space-between; text-align:left; min-height:40px;">
          <span>🎉 Upbeat Pop Energy</span><span style="font-size:10px; color:#60A5FA;">+ Insert</span>
        </button>
        <button class="btn btn-secondary btn-stock-music" data-track="ambient" style="justify-content:space-between; text-align:left; min-height:40px;">
          <span>🌌 Cinematic Wonder</span><span style="font-size:10px; color:#60A5FA;">+ Insert</span>
        </button>
        <button class="btn btn-secondary btn-stock-music" data-track="acoustic" style="justify-content:space-between; text-align:left; min-height:40px;">
          <span>🎸 Acoustic Breeze</span><span style="font-size:10px; color:#60A5FA;">+ Insert</span>
        </button>
      </div>
    `;
    container.appendChild(stockSec);

    stockSec.querySelectorAll('.btn-stock-music').forEach(btn => {
      btn.addEventListener('click', () => {
        const trackId = btn.getAttribute('data-track');
        const audioMap = {
          lofi: { url: 'assets/sample-sunset-chill.wav', name: 'Sunset Chill Lo-Fi.wav' },
          pop: { url: 'assets/sample-upbeat-pop.wav', name: 'Upbeat Pop Energy.wav' },
          ambient: { url: 'assets/sample-cinematic.wav', name: 'Cinematic Wonder.wav' },
          acoustic: { url: 'assets/sample-acoustic.wav', name: 'Acoustic Breeze.wav' }
        };
        const selected = audioMap[trackId] || audioMap.lofi;
        pushHistory();
        setProjectMusic(selected.url, selected.name);
        btn.textContent = '✓ Added to Project!';
        setTimeout(() => populateMobileAudioSheet(), 800);
      });
    });

    // Voiceover Microphone Recorder
    const voiceSec = document.createElement('div');
    voiceSec.style.marginTop = '12px';
    voiceSec.style.borderTop = '1px solid #1E293B';
    voiceSec.style.paddingTop = '10px';
    voiceSec.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#F43F5E; margin-bottom:8px;">🎙️ Live Voiceover Recorder</div>
      <div style="display:flex; gap:8px;">
        <button id="btn-record-voiceover" class="btn btn-secondary" style="flex:1; min-height:42px; color:#F43F5E; font-weight:700;">
          🔴 Record Voiceover
        </button>
        <button id="btn-stop-voiceover" class="btn btn-danger" style="display:none; flex:1; min-height:42px; font-weight:800;">
          ⏹ Stop &amp; Save
        </button>
      </div>
      <div id="voice-recording-status" style="font-size:11px; color:#94A3B8; margin-top:4px; text-align:center;">Microphone ready</div>
    `;
    container.appendChild(voiceSec);

    const recBtn = voiceSec.querySelector('#btn-record-voiceover');
    const stopBtn = voiceSec.querySelector('#btn-stop-voiceover');
    const statusLabel = voiceSec.querySelector('#voice-recording-status');

    recBtn.addEventListener('click', async () => {
      try {
        await audio.startVoiceoverRecording();
        recBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        statusLabel.textContent = '🔴 Recording live audio... Speak into microphone';
        statusLabel.style.color = '#F43F5E';
      } catch (err) {
        alert('Microphone error: ' + err.message);
      }
    });

    stopBtn.addEventListener('click', async () => {
      stopBtn.disabled = true;
      statusLabel.textContent = 'Processing recording...';
      try {
        const res = await audio.stopVoiceoverRecording();
        pushHistory();
        let voiceTrack = currentProject.timeline.tracks.find(t => t.type === 'voiceover');
        if (!voiceTrack) {
          voiceTrack = { id: 'track-voiceover-1', type: 'voiceover', clips: [] };
          currentProject.timeline.tracks.push(voiceTrack);
        }
        voiceTrack.clips.push({
          id: `clip-voice-${Date.now()}`,
          name: `Voiceover ${(res.duration).toFixed(1)}s`,
          startTime: currentTime,
          duration: res.duration,
          source: res.url,
          volume: 1.0
        });
        recalculateDuration();
        refreshTimeline();
        statusLabel.textContent = `✓ Recorded ${res.duration}s voiceover placed on timeline!`;
        statusLabel.style.color = '#10B981';
        setTimeout(() => populateMobileAudioSheet(), 1500);
      } catch (err) {
        alert('Error saving voiceover: ' + err.message);
        populateMobileAudioSheet();
      }
    });
  }

  // --- Stickers, Emojis & Atmospheric Particle Effects Sheet ---
  function populateMobileStickersSheet() {
    const container = document.getElementById('mobile-stickers-content');
    if (!container) return;
    container.innerHTML = '';

    // Emojis & Stickers Grid
    const EMOJIS = ['🔥', '❤️', '✨', '🌟', '🎉', '🚀', '🎬', '📸', '🎵', '🌴', '☕', '🍕', '👑', '💯', '🏖️', '🌺'];
    const emojiSec = document.createElement('div');
    emojiSec.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#38BDF8; margin-bottom:8px;">🌟 Quick Emoji &amp; Badge Stickers (Tap to Add)</div>
      <div style="display:grid; grid-template-columns: repeat(8, 1fr); gap:6px; margin-bottom:16px;">
        ${EMOJIS.map(e => `<button class="btn btn-secondary btn-emoji-sticker" data-emoji="${e}" style="padding:6px; font-size:22px; min-height:42px;">${e}</button>`).join('')}
      </div>
    `;
    container.appendChild(emojiSec);

    emojiSec.querySelectorAll('.btn-emoji-sticker').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        pushHistory();
        let overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
        if (!overlayTrack) {
          overlayTrack = { id: 'track-overlay-1', type: 'overlay', clips: [] };
          currentProject.timeline.tracks.push(overlayTrack);
        }
        overlayTrack.clips.push({
          id: `clip-sticker-${Date.now()}`,
          name: `Sticker ${emoji}`,
          startTime: currentTime,
          duration: 3.0,
          sticker: {
            emoji: emoji,
            fontSize: 76
          },
          transform: { anchorX: 0.5, anchorY: 0.5 }
        });
        recalculateDuration();
        refreshTimeline();
        requestRender();
        alert(`🌟 Added "${emoji}" sticker overlay at playhead!`);
      });
    });

    // Atmospheric Particle Effects
    const particleSec = document.createElement('div');
    const currentFX = currentProject.particleEffect || 'none';
    const EFFECTS = [
      { id: 'none', name: 'None', desc: 'Clean Video' },
      { id: 'sparkles', name: '✨ Golden Sparkles', desc: 'Twinkling stardust' },
      { id: 'snow', name: '❄️ Winter Snow', desc: 'Drifting snowfall' },
      { id: 'flare', name: '🌅 Lens Flare', desc: 'Cinematic light leak' },
      { id: 'hearts', name: '❤️ Floating Hearts', desc: 'Romance aesthetic' },
      { id: 'grain', name: '🎞️ 35mm Film Grain', desc: 'Nostalgic film dust' }
    ];

    particleSec.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#F59E0B; margin-bottom:8px;">✨ Atmospheric Particle Overlays</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        ${EFFECTS.map(fx => `
          <button class="btn ${currentFX === fx.id ? 'btn-primary' : 'btn-secondary'} btn-particle-fx" data-fx="${fx.id}" style="flex-direction:column; align-items:flex-start; padding:10px; min-height:48px;">
            <span style="font-size:12px; font-weight:800;">${fx.name}</span>
            <span style="font-size:9px; color:#CBD5E1; font-weight:normal;">${fx.desc}</span>
          </button>
        `).join('')}
      </div>
    `;
    container.appendChild(particleSec);

    particleSec.querySelectorAll('.btn-particle-fx').forEach(btn => {
      btn.addEventListener('click', () => {
        const fx = btn.getAttribute('data-fx');
        pushHistory();
        currentProject.particleEffect = fx;
        populateMobileStickersSheet();
        requestRender();
      });
    });
  }

  // 1-Click Intelligent Spectral Audio Beat Sync (100% Free & Native)
  async function autoBeatSyncPhotos() {
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (!videoTrack || videoTrack.clips.length === 0) {
      alert('Add photos to the timeline first!');
      return;
    }

    pushHistory();
    const motions = ['ZoomIn', 'PanLeft', 'ZoomOut', 'PanRight', 'KenBurns', 'DynamicZoom', 'DiagonalUpLeft'];
    const transitions = ['Glitch', 'WhipPan', 'FilmBurn', 'CrossDissolve', 'ZoomBlur'];

    const audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio');
    const audioSrc = audioTrack?.clips[0]?.source;

    let beatTimes = [];
    if (audioSrc) {
      try {
        beatTimes = await audio.detectBeats(audioSrc, videoTrack.clips.length + 1);
      } catch (e) {
        console.warn('Beat detection fallback:', e);
      }
    }

    let t = 0;
    videoTrack.clips.forEach((clip, idx) => {
      let dur = 2.5; // fallback
      if (beatTimes.length > idx + 1) {
        const beatDelta = beatTimes[idx + 1] - (beatTimes[idx] || 0);
        if (beatDelta >= 0.6 && beatDelta <= 6.0) {
          dur = parseFloat(beatDelta.toFixed(2));
        }
      }

      clip.startTime = t;
      clip.duration = dur;
      clip.motion = motions[idx % motions.length];
      clip.transitionOut = {
        type: transitions[idx % transitions.length],
        duration: Math.min(0.5, dur * 0.3)
      };
      t += dur;
    });

    if (audioTrack && audioTrack.clips.length > 0) {
      audioTrack.clips[0].duration = t;
    }

    recalculateDuration();
    refreshTimeline();
    updateInspector();
    requestRender();

    const beatStatus = beatTimes.length > 0 ? `Detected ${beatTimes.length} musical transients` : 'Using rhythmic 2.5s intervals';
    alert(`⚡ Magic Beat Sync Complete! ${beatStatus}. ${videoTrack.clips.length} photos synced with punchy transitions.`);
  }

  function populateMobileStylesSheet() {
    const container = document.getElementById('mobile-styles-content');
    if (!container) return;
    container.innerHTML = '';

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '10px';

    AVAILABLE_TEMPLATES.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="color:#FFF;">${tpl.name}</h4>
          <span style="font-size:10px; background:#4F46E5; padding:2px 8px; border-radius:4px;">${tpl.aspectRatio}</span>
        </div>
        <p>${tpl.description}</p>
        <button class="btn btn-primary btn-sm" style="width:100%; margin-top:4px;">Apply Template</button>
      `;
      card.querySelector('button').addEventListener('click', () => {
        pushHistory();
        applyTemplateToCurrentProject(tpl);
        closeBottomSheets();
        refreshTimeline();
        requestRender();
      });
      list.appendChild(card);
    });

    container.appendChild(list);
  }

  function populateMobileTitlesSheet() {
    const container = document.getElementById('mobile-titles-content');
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <label style="font-size:12px; color:#94A3B8;">Title Text Content</label>
        <input type="text" id="m-input-text-content" class="btn btn-secondary" style="width:100%; text-align:left; min-height:44px;" value="CAPTURING THE MAGIC OF THE SUNSET">

        <label style="font-size:12px; color:#94A3B8;">Font Typography</label>
        <select id="m-select-text-font" class="btn btn-secondary" style="width:100%; min-height:44px;">
          <option value="Inter">Inter (Clean Modern)</option>
          <option value="Impact">Impact (Bold Poster)</option>
          <option value="Playfair Display">Playfair Display (Luxury)</option>
          <option value="Cinzel">Cinzel (Cinematic)</option>
          <option value="Georgia">Georgia (Classic Serif)</option>
        </select>

        <label style="font-size:12px; color:#94A3B8;">Entrance Animation</label>
        <select id="m-select-text-anim" class="btn btn-secondary" style="width:100%; min-height:44px;">
          <option value="Pop">Pop &amp; Bounce</option>
          <option value="SlideUp">Slide Up</option>
          <option value="Fade">Smooth Fade</option>
        </select>

        <button id="m-btn-add-title-playhead" class="btn btn-primary" style="padding:14px; margin-top:8px;">➕ Add Title at Playhead</button>
      </div>
    `;

    container.querySelector('#m-btn-add-title-playhead')?.addEventListener('click', () => {
      pushHistory();
      let overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
      if (!overlayTrack) {
        overlayTrack = { id: 'track-overlay-1', type: 'overlay', clips: [] };
        currentProject.timeline.tracks.push(overlayTrack);
      }
      const textVal = container.querySelector('#m-input-text-content').value || 'Title';
      const fontVal = container.querySelector('#m-select-text-font').value || 'Inter';
      const animVal = container.querySelector('#m-select-text-anim').value || 'Pop';

      overlayTrack.clips.push({
        id: `clip-title-${Date.now()}`,
        startTime: currentTime,
        duration: 3.5,
        overlay: {
          text: textVal,
          fontFamily: fontVal,
          fontSize: 52,
          colorHex: '#FFFFFF',
          backgroundColorHex: 'rgba(0,0,0,0.6)',
          entryAnimation: animVal,
          animationDuration: 0.6
        },
        transform: { anchorX: 0.5, anchorY: 0.85 }
      });
      recalculateDuration();
      refreshTimeline();
      requestRender();
      closeBottomSheets();
    });
  }

  // --- Clip Reordering (Move Left / Right on Timeline) ---
  function moveSelectedClip(direction) {
    if (!selectedClip) return;
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (!videoTrack) return;

    const idx = videoTrack.clips.indexOf(selectedClip);
    if (idx === -1) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= videoTrack.clips.length) return;

    pushHistory();
    const temp = videoTrack.clips[idx];
    videoTrack.clips[idx] = videoTrack.clips[targetIdx];
    videoTrack.clips[targetIdx] = temp;

    // Recalculate start times sequentially
    let t = 0;
    videoTrack.clips.forEach(c => {
      c.startTime = t;
      t += c.duration;
    });

    recalculateDuration();
    refreshTimeline();
    requestRender();
  }

  function applyTemplateToCurrentProject(tpl) {
    setAspectRatio(tpl.aspectRatio);
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      videoTrack.clips.forEach(clip => {
        clip.motion = tpl.motion || 'ZoomIn';
        clip.cropMode = tpl.cropMode || 'BlurBackground';
        clip.transitionOut = { type: tpl.transition || 'CrossDissolve', duration: tpl.transitionDuration || 0.5 };
      });
    }
  }

  function populateSampleMedia() {
    const samplePhotos = window.VideoCreatorSampleMedia || [
      { name: 'Tropical Sunset Beach.jpg', url: 'assets/sample-beach.jpg' },
      { name: 'Alpine Glacial Lake.jpg', url: 'assets/sample-mountains.jpg' },
      { name: 'Cozy Morning Cafe.jpg', url: 'assets/sample-cafe.jpg' },
      { name: 'Cyberpunk Neon City.jpg', url: 'assets/sample-cyberpunk.jpg' },
      { name: 'Golden Autumn Forest.jpg', url: 'assets/sample-forest.jpg' }
    ];

    const motions = ['ZoomIn', 'PanLeft', 'ZoomOut', 'KenBurns', 'DynamicZoom'];
    const filters = ['cinematic', 'teal-orange', 'sunset', 'cyberpunk', 'vintage'];

    samplePhotos.forEach((s, idx) => {
      engine.loadImage(s.url);
      currentProject.assets.push({ id: `sample-${idx}`, name: s.name, type: 'image', source: s.url });

      const clip = {
        id: `clip-video-${idx}`,
        name: s.name,
        startTime: idx * 3.5,
        duration: 3.5,
        source: s.url,
        motion: motions[idx % motions.length],
        cropMode: 'BlurBackground',
        filterPreset: filters[idx % filters.length],
        transitionOut: { type: 'CrossDissolve', duration: 0.6 },
        transform: { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 },
        colorGrading: { exposure: 0.2, contrast: 55, saturation: 110 }
      };
      currentProject.timeline.tracks[0].clips.push(clip);
    });

    // Add Overlay Text
    currentProject.timeline.tracks[1].clips.push({
      id: 'clip-overlay-1',
      startTime: 0.5,
      duration: 5.0,
      overlay: {
        text: 'SUNSET ADVENTURES ✨',
        fontFamily: 'Inter',
        fontSize: 54,
        colorHex: '#FFFFFF',
        backgroundColorHex: 'rgba(0,0,0,0.6)',
        entryAnimation: 'Pop',
        animationDuration: 0.6
      },
      transform: { anchorX: 0.5, anchorY: 0.85 }
    });

    // Attach real background audio track from static assets
    const sampleAudioUrl = 'assets/sample-sunset-chill.wav';
    currentProject.assets.push({ id: 'sample-audio-1', name: 'Sunset Chill Lo-Fi.wav', type: 'audio', source: sampleAudioUrl });
    currentProject.timeline.tracks[2].clips = [{
      id: 'clip-audio-1',
      name: 'Sunset Chill Lo-Fi.wav',
      startTime: 0,
      duration: currentProject.timeline.totalDuration || 17.5,
      source: sampleAudioUrl,
      volume: 1.0
    }];
    audio.loadAudio(sampleAudioUrl);

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
      const thumb = t.thumbnail || 'assets/sample-beach.jpg';
      const card = document.createElement('div');
      card.className = 'template-card';
      card.style.position = 'relative';
      card.innerHTML = `
        <div style="height:120px; border-radius:6px; overflow:hidden; position:relative; background:#1E2433;">
          <img src="${thumb}" style="width:100%; height:100%; object-fit:cover;">
          <span class="badge" style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.75); color:#60A5FA; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800;">${t.aspectRatio}</span>
        </div>
        <h4 style="margin-top:6px;">${t.name}</h4>
        <p>${t.description}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">
          <span style="font-size:11px; color:#34D399; font-weight:700;">🎵 ${t.audioName?.split('.')[0] || 'AUDIO'}</span>
          <button class="btn btn-primary btn-sm">Use Template</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        pushHistory();
        applyTemplate(t);
        wizardState.photos = (window.VideoCreatorSampleMedia || []).map(m => ({ name: m.name, url: m.url }));
        wizardState.musicUrl = t.audioUrl || 'assets/sample-sunset-chill.wav';
        wizardState.musicFile = { name: t.audioName || 'Sunset Chill Lo-Fi.wav' };
        currentProject = generateProjectFromWizard(wizardState);
        currentTime = 0;
        switchScreen('editor');
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

  let isAutosaveDisabled = false;

  function discardCurrentSession() {
    isAutosaveDisabled = true;
    try {
      localStorage.removeItem('vc_autosave_snapshot');
    } catch {}

    const banner = document.getElementById('recovery-banner');
    if (banner) banner.style.display = 'none';

    pushHistory();
    currentProject = createDefaultProject('Sunset Adventure', '16:9');
    currentTime = 0;
    selectedClip = null;
    refreshTimeline();
    refreshMediaLibrary();
    updateInspector();
    requestRender();

    // Re-enable autosave for future edits after a brief pause
    setTimeout(() => { isAutosaveDisabled = false; }, 2000);
  }

  function setupAutosaveAndRecovery() {
    const banner = document.getElementById('recovery-banner');
    const restoreBtn = document.getElementById('btn-restore-recovery');
    const discardBtn = document.getElementById('btn-discard-recovery');

    if (banner) banner.style.display = 'none';

    try {
      const snapshot = localStorage.getItem('vc_autosave_snapshot');
      if (snapshot) {
        const parsed = JSON.parse(snapshot);
        // Only show recovery banner if the saved project has customized clips
        const hasContent = parsed && parsed.timeline && parsed.timeline.tracks && parsed.timeline.tracks.some(t => t.clips && t.clips.length > 0);
        if (hasContent && banner) {
          banner.style.display = 'flex';

          restoreBtn?.addEventListener('click', () => {
            pushHistory();
            currentProject = parsed;
            banner.style.display = 'none';
            switchScreen('editor');
            refreshTimeline();
            refreshMediaLibrary();
            updateInspector();
            requestRender();
          });
        }
      }
    } catch (e) {
      try { localStorage.removeItem('vc_autosave_snapshot'); } catch {}
    }

    discardBtn?.addEventListener('click', () => {
      discardCurrentSession();
      alert('✓ Unsaved project session discarded.');
    });

    document.getElementById('menu-file-discard')?.addEventListener('click', () => {
      closeAllDropdowns();
      if (confirm('Discard current project session and reset to a clean workspace?')) {
        discardCurrentSession();
      }
    });

    setInterval(() => {
      if (isAutosaveDisabled) return;
      try {
        if (currentProject && currentProject.timeline && currentProject.assets && currentProject.assets.length > 0) {
          localStorage.setItem('vc_autosave_snapshot', JSON.stringify(currentProject));
        }
      } catch {}
    }, 12000);
  }

  // --- Quick Create Wizard ---
  let selectedWizardStockTrack = 'lofi';
  const wizardAudioMap = {
    lofi: { url: 'assets/sample-sunset-chill.wav', name: 'Sunset Chill Lo-Fi.wav' },
    pop: { url: 'assets/sample-upbeat-pop.wav', name: 'Upbeat Pop Energy.wav' },
    ambient: { url: 'assets/sample-cinematic.wav', name: 'Cinematic Wonder.wav' },
    acoustic: { url: 'assets/sample-acoustic.wav', name: 'Acoustic Breeze.wav' }
  };

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
    const loadSamplesBtn = document.getElementById('btn-wizard-load-samples');

    photoDropzone.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', (e) => {
      handlePhotoFiles(e.target.files);
      photoInput.value = ''; // Reset so the same files can be re-selected on mobile
    });

    // 1-Click Load HD Sample Photos Pack
    loadSamplesBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      wizardState.photos = (window.VideoCreatorSampleMedia || []).map(m => {
        engine.loadImage(m.url);
        return { name: m.name, url: m.url };
      });
      renderPhotoChips();
    });

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
          // Load into main engine cache immediately (awaited during export)
          engine.loadImage(url).then(img => {
            if (!img) console.warn('[Wizard] Failed to load photo:', file.name);
          });
        }
      });
      renderPhotoChips();
    }

    function renderPhotoChips() {
      photoChips.innerHTML = '';
      wizardState.photos.forEach((p, idx) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '6px';
        chip.innerHTML = `
          <img src="${p.url}" style="width:22px; height:22px; border-radius:3px; object-fit:cover;">
          <span>${p.name.split('.')[0]}</span>
          <span class="chip-remove" data-idx="${idx}" style="cursor:pointer; margin-left:4px;">✕</span>
        `;
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

    // Music Upload & Stock Track Selection
    const musicDropzone = document.getElementById('music-dropzone');
    const musicInput = document.getElementById('music-file-input');
    const musicName = document.getElementById('wizard-music-name');

    musicDropzone.addEventListener('click', () => musicInput.click());
    musicInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        wizardState.musicFile = file;
        wizardState.musicUrl = URL.createObjectURL(file);
        musicName.textContent = `🎵 Custom: ${file.name}`;
        document.querySelectorAll('.wizard-stock-audio-btn').forEach(b => b.classList.remove('active'));
      }
    });

    const stockAudioBtns = document.querySelectorAll('.wizard-stock-audio-btn');
    stockAudioBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        stockAudioBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedWizardStockTrack = btn.getAttribute('data-track');
        const selected = wizardAudioMap[selectedWizardStockTrack] || wizardAudioMap.lofi;
        wizardState.musicUrl = selected.url;
        wizardState.musicFile = { name: selected.name };
        musicName.textContent = `🎵 Selected Track: ${selected.name}`;
      });
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
      // Auto load samples if empty
      if (wizardState.photos.length === 0) {
        wizardState.photos = (window.VideoCreatorSampleMedia || []).map(m => {
          engine.loadImage(m.url);
          return { name: m.name, url: m.url };
        });
      }

      if (!wizardState.musicUrl) {
        const selected = wizardAudioMap[selectedWizardStockTrack] || wizardAudioMap.lofi;
        wizardState.musicUrl = selected.url;
        wizardState.musicFile = { name: selected.name };
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
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          currentProject.assets.push({ id: `asset-${Date.now()}-${Math.random()}`, name: file.name, type: 'image', source: url });
          engine.loadImage(url).then(img => {
            if (!img) console.warn('[Editor] Failed to load photo:', file.name);
          });
        }
      });
      // Reset the input so the same file can be re-selected (critical on mobile)
      editorPhotoInput.value = '';
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
      // Reset the input so the same file can be re-selected (critical on mobile)
      editorMusicInput.value = '';
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

    // Motion, Transition & Particle Selectors
    document.getElementById('select-clip-motion')?.addEventListener('change', (e) => {
      if (selectedClip && selectedClip.source) {
        selectedClip.motion = e.target.value;
        requestRender();
      }
    });

    document.getElementById('select-clip-transition')?.addEventListener('change', (e) => {
      if (selectedClip && selectedClip.source) {
        if (!selectedClip.transitionOut) selectedClip.transitionOut = { duration: 0.5 };
        selectedClip.transitionOut.type = e.target.value;
        requestRender();
      }
    });

    document.getElementById('select-particle-fx')?.addEventListener('change', (e) => {
      currentProject.particleEffect = e.target.value;
      requestRender();
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

    const particleSelect = document.getElementById('select-particle-fx');
    if (particleSelect) particleSelect.value = currentProject.particleEffect || 'none';

    if (!selectedClip) {
      titleLabel.textContent = 'NO CLIP SELECTED';
      textSec.style.display = 'none';
      return;
    }

    if (selectedClip.source) {
      titleLabel.textContent = (selectedClip.name || 'PHOTO CLIP').toUpperCase();
      textSec.style.display = 'none';

      const motionSelect = document.getElementById('select-clip-motion');
      if (motionSelect) motionSelect.value = selectedClip.motion || 'KenBurns';

      const transSelect = document.getElementById('select-clip-transition');
      if (transSelect) transSelect.value = selectedClip.transitionOut?.type || 'CrossDissolve';

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

  // --- High-Performance On-Demand & 60 FPS Playback Rendering ---
  let isDirty = true;

  function requestRender() {
    isDirty = true;
    if (!isPlaying && !animFrameId) {
      animFrameId = requestAnimationFrame(renderFrameOnce);
    }
  }

  function renderFrameOnce() {
    animFrameId = null;
    engine.render(currentProject, currentTime);
    isDirty = false;
  }

  function togglePlayPause() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';

    if (isPlaying) {
      audio.playAt(currentTime);
      lastPlayTimestamp = performance.now();
      startRenderLoop();
    } else {
      audio.pause();
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      requestRender();
    }
  }

  function seek(timeSec) {
    const totalDur = currentProject.timeline.totalDuration || 14.0;
    currentTime = Math.max(0, Math.min(totalDur, timeSec));
    audio.seek(currentTime);
    updatePlayheadPosition();
    requestRender();
  }

  function startRenderLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function loop(timestamp) {
      if (!isPlaying) {
        animFrameId = null;
        return;
      }

      const deltaSec = Math.min(0.1, (timestamp - lastPlayTimestamp) / 1000);
      lastPlayTimestamp = timestamp;
      currentTime += deltaSec;

      const totalDur = currentProject.timeline.totalDuration || 14.0;
      if (currentTime >= totalDur) {
        currentTime = 0;
        togglePlayPause();
        return;
      }

      updatePlayheadPosition();
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

    if (!videoTrackArea || !textTrackArea || !audioTrackArea || !voiceoverArea) return;

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

    setupTimelineScrubberTouch();
    updatePlayheadPosition();
  }

  function setupTimelineScrubberTouch() {
    const tracksArea = document.getElementById('timeline-tracks-area');
    const playhead = document.getElementById('timeline-playhead');
    if (!tracksArea || tracksArea._hasTouch) return;
    tracksArea._hasTouch = true;

    function handleSeekEvent(clientX) {
      const rect = tracksArea.getBoundingClientRect();
      const scrollLeft = tracksArea.scrollLeft;
      const x = clientX - rect.left + scrollLeft - 90; // offset track label col
      const time = Math.max(0, x / timelineZoom);
      seek(time);
    }

    let isScrubbing = false;

    playhead?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isScrubbing = true;
    });

    playhead?.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      isScrubbing = true;
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
      if (isScrubbing) handleSeekEvent(e.clientX);
    });

    window.addEventListener('touchmove', (e) => {
      if (isScrubbing && e.touches.length > 0) {
        handleSeekEvent(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener('mouseup', () => { isScrubbing = false; });
    window.addEventListener('touchend', () => { isScrubbing = false; });

    tracksArea.addEventListener('click', (e) => {
      if (e.target.closest('.clip-block') || e.target.closest('.clip-resize-handle')) return;
      handleSeekEvent(e.clientX);
    });
  }

  function createClipBlock(clip, className, label) {
    const div = document.createElement('div');
    div.className = `clip-block ${className} ${selectedClip === clip ? 'selected' : ''}`;
    div.style.left = `${clip.startTime * timelineZoom}px`;
    div.style.width = `${clip.duration * timelineZoom}px`;
    div.innerHTML = `
      <div class="clip-trim-left-handle" title="Drag to trim start"></div>
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; pointer-events:none; margin:0 12px;">${label} (${clip.duration.toFixed(1)}s)</span>
      <div class="clip-resize-handle" title="Drag to adjust duration"></div>
    `;

    // Long press detection for mobile
    let longPressTimer = null;
    div.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        selectedClip = clip;
        const actionTitle = document.getElementById('action-sheet-title');
        if (actionTitle) actionTitle.textContent = clip.name || 'Selected Clip';
        openBottomSheet('actions');
      }, 450);
    }, { passive: true });

    div.addEventListener('touchend', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
    });
    div.addEventListener('touchmove', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
    });

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('clip-resize-handle') || e.target.classList.contains('clip-trim-left-handle')) return;
      e.stopPropagation();
      selectedClip = clip;
      seek(clip.startTime);
      refreshTimeline();
      updateInspector();

      // If on mobile, open inspector bottom sheet
      if (window.innerWidth < 768) {
        openBottomSheet('inspector');
      }
    });

    // 1. Right Duration Resize Handle Dragging (Mouse & Touch)
    const resizeHandle = div.querySelector('.clip-resize-handle');
    let isResizing = false;
    let startX = 0;
    let startDuration = clip.duration;

    function onResizeStart(clientX) {
      isResizing = true;
      startX = clientX;
      startDuration = clip.duration;
      pushHistory();
    }

    function onResizeMove(clientX) {
      if (!isResizing) return;
      const deltaX = clientX - startX;
      const deltaSec = deltaX / timelineZoom;
      const newDuration = Math.max(0.5, Math.min(60.0, startDuration + deltaSec));

      clip.duration = parseFloat(newDuration.toFixed(1));
      div.style.width = `${clip.duration * timelineZoom}px`;

      // Ripple start times of subsequent clips on same track
      const track = currentProject.timeline.tracks.find(t => t.clips.includes(clip));
      if (track) {
        let t = 0;
        track.clips.forEach(c => {
          c.startTime = t;
          t += c.duration;
        });
      }

      recalculateDuration();
      updateInspector();
      updatePlayheadPosition();
    }

    function onResizeEnd() {
      if (isResizing) {
        isResizing = false;
        refreshTimeline();
        updateInspector();
      }
    }

    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onResizeStart(e.clientX);
    });

    resizeHandle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (e.touches.length > 0) {
        onResizeStart(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
      if (isResizing) onResizeMove(e.clientX);
    });

    window.addEventListener('touchmove', (e) => {
      if (isResizing && e.touches.length > 0) {
        onResizeMove(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener('mouseup', onResizeEnd);
    window.addEventListener('touchend', onResizeEnd);

    // 2. Left Start-Trim Handle Dragging (Mouse & Touch)
    const trimLeftHandle = div.querySelector('.clip-trim-left-handle');
    let isTrimmingLeft = false;
    let trimStartX = 0;
    let origStartTime = clip.startTime;
    let origDuration = clip.duration;

    function onTrimLeftStart(clientX) {
      isTrimmingLeft = true;
      trimStartX = clientX;
      origStartTime = clip.startTime;
      origDuration = clip.duration;
      pushHistory();
    }

    function onTrimLeftMove(clientX) {
      if (!isTrimmingLeft) return;
      const deltaX = clientX - trimStartX;
      const deltaSec = deltaX / timelineZoom;

      const maxShift = origDuration - 0.5; // keep at least 0.5s duration
      const clampedDelta = Math.max(-origStartTime, Math.min(maxShift, deltaSec));

      clip.startTime = parseFloat((origStartTime + clampedDelta).toFixed(1));
      clip.duration = parseFloat((origDuration - clampedDelta).toFixed(1));

      div.style.left = `${clip.startTime * timelineZoom}px`;
      div.style.width = `${clip.duration * timelineZoom}px`;

      recalculateDuration();
      updateInspector();
      updatePlayheadPosition();
    }

    function onTrimLeftEnd() {
      if (isTrimmingLeft) {
        isTrimmingLeft = false;
        refreshTimeline();
        updateInspector();
      }
    }

    trimLeftHandle?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onTrimLeftStart(e.clientX);
    });

    trimLeftHandle?.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (e.touches.length > 0) {
        onTrimLeftStart(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
      if (isTrimmingLeft) onTrimLeftMove(e.clientX);
    });

    window.addEventListener('touchmove', (e) => {
      if (isTrimmingLeft && e.touches.length > 0) {
        onTrimLeftMove(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener('mouseup', onTrimLeftEnd);
    window.addEventListener('touchend', onTrimLeftEnd);

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
    const sel = document.getElementById('editor-aspect-select');
    if (sel) sel.value = ratio;
    resizeCanvasWrapper();
  }

  function resizeCanvasWrapper() {
    const wrapper = document.getElementById('canvas-wrapper');
    const stage = document.querySelector('.viewport-canvas-stage') || document.querySelector('.center-viewport');
    if (!wrapper || !stage) return;

    const { width, height } = currentProject.canvas;
    const aspect = width / height;

    const isMobile = window.innerWidth < 768;
    const isLandscapeMobile = window.innerHeight < 520 && window.innerWidth > window.innerHeight;

    const stageHeight = stage.clientHeight || (window.innerHeight - 340);
    const stageWidth = stage.clientWidth || (window.innerWidth - 40);

    const maxH = isLandscapeMobile
      ? Math.max(150, window.innerHeight - 130)
      : isMobile
        ? Math.max(170, stageHeight - 40)
        : Math.max(200, stageHeight - 50);

    const maxW = Math.max(220, stageWidth - 24);

    let targetH = maxH;
    let targetW = targetH * aspect;
    if (targetW > maxW) {
      targetW = maxW;
      targetH = targetW / aspect;
    }

    wrapper.style.width = `${Math.round(targetW)}px`;
    wrapper.style.height = `${Math.round(targetH)}px`;

    const dimBadge = document.getElementById('canvas-dim-badge');
    if (dimBadge) {
      dimBadge.textContent = `${width}x${height}`;
    }
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

    // Also synchronize mobile media sheet
    populateMobileMediaSheet();
  }

  function insertPhotoAtPlayhead(src, name = 'Photo') {
    let videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video');
    if (!videoTrack) {
      videoTrack = { id: 'track-video-1', type: 'video', clips: [] };
      currentProject.timeline.tracks.push(videoTrack);
    }
    let startT = currentTime;
    if (startT === 0 && videoTrack.clips.length > 0) {
      const last = videoTrack.clips[videoTrack.clips.length - 1];
      startT = last.startTime + last.duration;
    }
    const clip = {
      id: `clip-photo-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      name: name,
      startTime: startT,
      duration: 3.5,
      source: src,
      motion: 'ZoomIn',
      cropMode: 'BlurBackground',
      transitionOut: { type: 'CrossDissolve', duration: 0.6 },
      transform: { rotationDegrees: 0, scaleX: 1.0, flipX: false, flipY: false, opacity: 1.0 },
      colorGrading: { exposure: 0, contrast: 50, saturation: 100 }
    };
    videoTrack.clips.push(clip);
    videoTrack.clips.sort((a, b) => a.startTime - b.startTime);
    selectedClip = clip;
    recalculateDuration();
    refreshTimeline();
    updateInspector();
  }

  // --- Export Modal ---
  function setupExportModal() {
    const modal = document.getElementById('export-modal');
    const exportBtn = document.getElementById('btn-start-export');
    const shareBtn = document.getElementById('btn-share-export');
    const directDownloadBtn = document.getElementById('btn-direct-download');
    const progressContainer = document.getElementById('export-progress-group');
    const progressFill = document.getElementById('export-progress-fill');
    const progressLabel = document.getElementById('export-progress-label');

    document.getElementById('btn-close-export').addEventListener('click', () => {
      modal.classList.remove('active');
      shareBtn.style.display = 'none';
      if (directDownloadBtn) directDownloadBtn.style.display = 'none';
    });

    let lastExportResult = null;

    exportBtn.addEventListener('click', async () => {
      const res = document.getElementById('export-resolution-select')?.value || '1080';
      const fps = parseInt(document.getElementById('export-fps-select')?.value) || 30;

      exportBtn.disabled = true;
      shareBtn.style.display = 'none';
      if (directDownloadBtn) directDownloadBtn.style.display = 'none';
      progressContainer.style.display = 'block';
      progressFill.style.width = '0%';
      progressLabel.textContent = 'Preparing render engine...';

      try {
        const result = await exporter.exportVideo(currentProject, { resolution: res, fps: fps }, (p) => {
          progressFill.style.width = `${p.percentage}%`;
          progressLabel.textContent = `Encoding MP4: ${p.percentage}% (${p.currentTime}s / ${p.totalDuration}s)`;
        });

        lastExportResult = result;
        progressLabel.textContent = '✓ Video Rendered Successfully!';

        const fileName = `${(currentProject.metadata?.name || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}.${result.ext}`;

        // Set direct download button
        if (directDownloadBtn) {
          directDownloadBtn.href = result.url;
          directDownloadBtn.download = fileName;
          directDownloadBtn.style.display = 'block';
        }

        // Trigger automatic download
        const a = document.createElement('a');
        a.href = result.url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Show native Share button if available on device (Mobile WhatsApp / Social Media)
        const fileObj = new File([result.blob], fileName, { type: result.blob.type });
        if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
          shareBtn.style.display = 'block';
          shareBtn.onclick = async () => {
            try {
              await navigator.share({
                files: [fileObj],
                title: currentProject.metadata?.name || 'VideoCreator Story',
                text: 'Created with VideoCreator Pro Studio'
              });
            } catch (err) {
              if (err.name !== 'AbortError') console.warn('Share error:', err);
            }
          };
        }

        exportBtn.disabled = false;
        exportBtn.textContent = '🔄 Render Again';
      } catch (err) {
        alert('Export failed: ' + err.message);
        exportBtn.disabled = false;
        exportBtn.textContent = 'Render & Download MP4';
      }
    });
  }

  // --- Native Web Speech AI Voiceover & Karaoke Subtitles Setup (100% Free & Native) ---
  function setupVoiceoverModal() {
    const modal = document.getElementById('voiceover-modal');
    const closeBtn = document.getElementById('btn-close-voiceover');
    const previewBtn = document.getElementById('btn-preview-voice');
    const createBtn = document.getElementById('btn-create-voiceover');
    const textInput = document.getElementById('voiceover-script-input');
    const voiceSelect = document.getElementById('voiceover-voice-select');
    const rateSelect = document.getElementById('voiceover-rate-select');

    function populateVoices() {
      if (!voiceSelect) return;
      voiceSelect.innerHTML = '';
      const voices = audio.getAvailableVoices();
      if (voices.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Default System Voice';
        voiceSelect.appendChild(opt);
        return;
      }
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})${v.default ? ' — Recommended' : ''}`;
        voiceSelect.appendChild(opt);
      });
    }

    populateVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    document.getElementById('editor-add-voiceover-btn')?.addEventListener('click', () => {
      populateVoices();
      modal?.classList.add('active');
    });

    closeBtn?.addEventListener('click', () => {
      window.speechSynthesis?.cancel();
      modal?.classList.remove('active');
    });

    previewBtn?.addEventListener('click', async () => {
      const text = textInput?.value?.trim() || 'Welcome to our sunset adventure!';
      const voiceName = voiceSelect?.value;
      const rate = parseFloat(rateSelect?.value || '1.0');
      try {
        const res = await audio.synthesizeSpeech(text, { voiceName, rate });
        window.speechSynthesis.speak(res.utterance);
      } catch (err) {
        alert('Voice preview error: ' + err.message);
      }
    });

    createBtn?.addEventListener('click', async () => {
      const text = textInput?.value?.trim();
      if (!text) {
        alert('Please enter some narration text first!');
        return;
      }
      const voiceName = voiceSelect?.value;
      const rate = parseFloat(rateSelect?.value || '1.0');

      createBtn.disabled = true;
      createBtn.textContent = 'Generating Voiceover & Subtitles...';

      try {
        pushHistory();
        const res = await audio.synthesizeSpeech(text, { voiceName, rate });

        // 1. Add/Update Voiceover Track in Timeline
        let voiceTrack = currentProject.timeline.tracks.find(t => t.type === 'voiceover');
        if (!voiceTrack) {
          voiceTrack = { id: 'track-voiceover-1', type: 'voiceover', clips: [] };
          currentProject.timeline.tracks.push(voiceTrack);
        }

        voiceTrack.clips = [{
          id: `clip-vo-${Date.now()}`,
          name: `🎙 ${text.slice(0, 20)}...`,
          startTime: currentTime,
          duration: res.duration,
          text: text,
          volume: 1.0
        }];

        // 2. Add Synchronized Bouncing Karaoke Subtitles Overlay
        let overlayTrack = currentProject.timeline.tracks.find(t => t.type === 'overlay');
        if (!overlayTrack) {
          overlayTrack = { id: 'track-overlay-1', type: 'overlay', clips: [] };
          currentProject.timeline.tracks.push(overlayTrack);
        }

        const subtitleClip = {
          id: `clip-karaoke-${Date.now()}`,
          name: 'Karaoke Subtitles',
          startTime: currentTime,
          duration: res.duration,
          words: res.words,
          overlay: {
            text: text,
            fontFamily: 'Montserrat',
            fontSize: 54,
            colorHex: '#FFFFFF',
            entryAnimation: 'Pop',
            animationDuration: 0.3
          },
          transform: { anchorX: 0.5, anchorY: 0.82 }
        };

        overlayTrack.clips.push(subtitleClip);
        selectedClip = subtitleClip;

        recalculateDuration();
        refreshTimeline();
        updateInspector();
        requestRender();

        modal?.classList.remove('active');
        alert(`✨ Voiceover & Bouncing Karaoke Subtitles generated (${res.duration}s)!`);
      } catch (err) {
        alert('Voice generation error: ' + err.message);
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = '✨ Generate & Sync Subtitles';
      }
    });
  }

  // --- Social Media Safe Zones & 1-Click Cover Photo Export (100% Free & Native) ---
  function setupSafeZonesAndCoverExport() {
    const safeZoneSelect = document.getElementById('editor-safezone-select');
    safeZoneSelect?.addEventListener('change', (e) => {
      currentProject.safeZone = e.target.value;
      requestRender();
    });

    document.getElementById('btn-export-cover')?.addEventListener('click', () => {
      const prevSafeZone = currentProject.safeZone;
      currentProject.safeZone = 'none';
      engine.render(currentProject, currentTime);

      canvas.toBlob((blob) => {
        currentProject.safeZone = prevSafeZone;
        requestRender();
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(currentProject.metadata?.name || 'cover').replace(/[^a-zA-Z0-9_-]/g, '_')}_thumb.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/jpeg', 0.95);
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
