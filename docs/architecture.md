# VideoCreator Architecture

VideoCreator is built upon **Clean Architecture** principles in .NET 8 / C#, separating domain rules, media processing, rendering pipelines, application orchestration, and user interface layers.

```
┌────────────────────────────────────────────────────────┐
│                   VideoCreator.App                     │
│               (Avalonia UI 11.x / MVVM)                │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                VideoCreator.Application                │
│     (Project, AutoCreation, Timeline, ExportQueue)     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                   VideoCreator.Core                    │
│    (Domain Models, Timeline, Keyframes, Commands)      │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
┌──────────────▼──────────┐    ┌──────────▼──────────────┐
│    VideoCreator.Media   │    │  VideoCreator.Rendering │
│  (FFmpeg, Waveforms,    │    │  (SkiaSharp Compositor, │
│   Audio Analysis, Crop) │    │   Motion, Transitions)  │
└─────────────────────────┘    └─────────────────────────┘
```

## Layer Responsibilities

### 1. `VideoCreator.Core`
- Pure C# domain model with **zero UI and zero FFmpeg dependencies**.
- Contains models for `Project`, `CanvasSettings`, `Timeline`, `Track`, `Clip` hierarchy (`ImageClip`, `VideoClip`, `AudioClip`, `TextClip`, `ShapeClip`, `StickerClip`).
- Defines `Keyframe` interpolation engine (`Linear`, `EaseIn`, `EaseOut`, `EaseInOut`), `Transform`, `Transition`, and `Effect` stacks.
- Provides Command Pattern implementations (`AddClipCommand`, `DeleteClipCommand`, `MoveClipCommand`, `ResizeClipCommand`, `SplitClipCommand`, `UndoRedoManager`).
- Implements `ProjectSerializer` and `IProjectMigration` versioning engine.

### 2. `VideoCreator.Application`
- Orchestrates use cases without tying to specific platforms.
- `IAutoVideoGenerator` / `AutoVideoGenerator`: Automatic video generation from photos, audio beat analysis, and style templates.
- `IProjectService` / `ProjectService`: Save/load, dirty state tracking, project lifetime.
- `ITimelineService` / `TimelineService`: High-level timeline manipulation wrapped in undoable commands.
- `IExportQueueService` / `ExportQueueService`: Background render queue with progress and cancellation.
- `ICacheService` / `CacheService`: LRU cache for waveforms, thumbnails, and proxy frames.

### 3. `VideoCreator.Media`
- Encapsulates FFmpeg and FFprobe binary execution behind `IMediaEngine`.
- `FFmpegLocator`: Automatic discovery of FFmpeg/FFprobe across macOS (`/opt/homebrew/bin`, `/usr/local/bin`), Windows (`PATH`, default directories), and Linux.
- `IAudioAnalyzer` / `AudioAnalyzer`: Audio beat and BPM detection, energy variance analysis, and onset detection.
- `ISmartCropService` / `SmartCropService`: Generates blurred backgrounds for aspect ratio mismatches using SkiaSharp.

### 4. `VideoCreator.Rendering`
- `IPreviewRenderer` / `PreviewRenderer`: Real-time SkiaSharp compositing of multi-track layers, transitions, effects, and text overlays with caching.
- `PhotoMotionEngine`: Ken Burns camera motion computation (`ZoomIn`, `ZoomOut`, `PanLeft`, `PanRight`, `Cinematic`, `Diagonal`).
- `TransitionRenderer`: Real-time cross-fade, slide, push, zoom, and wipe transition blending.
- `EffectsProcessor`: Color matrix filters (brightness, contrast, grayscale, vintage, cinematic teal/orange, vignette).
- `TextRenderer`: Formatted typography rendering with shadow, stroke, background pill, and entry/exit animations (`Fade`, `Slide`, `Pop`, `Typewriter`).
- `IExportEngine` / `FFmpegExportEngine`: Frame-by-frame raw video pipe to FFmpeg H.264/AAC MP4 encoder.

### 5. `VideoCreator.Infrastructure`
- `IAutosaveService` / `AutosaveService`: Debounced periodic autosave snapshots and crash recovery.
- `HardwareAccelerationDetector`: Detects Apple VideoToolbox, Nvidia NVENC, Intel QSV, AMD AMF encoders.
- `LocalizationService`: Multi-language dictionary support (English, Hindi, Marathi).

### 6. `VideoCreator.App`
- Avalonia UI 11 desktop application with dark creative studio theme.
- ViewModels built with `CommunityToolkit.Mvvm`.
- Custom controls: `VideoPreviewControl` and `TimelineCanvasControl`.
- Screens: Home Landing, Quick Create 4-Step Wizard, Studio Editor, and Export Dialog.
