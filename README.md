# VideoCreator 🎬

> **A rich, modern, cross-platform video creation and editing application built with .NET 8, C#, Avalonia UI, SkiaSharp, and FFmpeg.**

Turn your photos and music into cinematic videos in seconds with automatic beat-sync timing, smooth Ken Burns camera motion, transition shaders, and professional text overlays, while retaining a full non-destructive multi-track studio editor.

---

## ✨ Features

- **⚡ Quick Create Wizard**: 4-step beginner experience to upload photos, choose music, pick a style template, and generate a video automatically.
- **🎞 Multi-Track Studio Editor**: Non-destructive video tracks, overlay/text tracks, and audio tracks with split, trim, resize, and reorder.
- **📸 Ken Burns Photo Motion**: Dynamic camera presets including *Zoom In, Zoom Out, Pan Left, Pan Right, Pan Up, Pan Down, Diagonal, and Cinematic*.
- **🖼 Smart Crop & Blurred Background**: Elegant handling of portrait/landscape aspect ratio mismatches with Gaussian-blurred backgrounds.
- **🔤 Animated Text Overlays**: Typography controls, background pills, drop shadows, stroke outlines, and entry/exit animations (*Fade, Slide, Pop, Zoom, Typewriter*).
- **🎨 Non-Destructive Effects**: Real-time color filters (*Brightness, Contrast, Grayscale, Vintage Sepia, Cinematic Teal/Orange, Vignette, Blur*).
- **🔄 Transition Shaders**: *Cross Dissolve, Slide Left/Right/Up/Down, Push, Zoom Blur, Wipe, and Fade*.
- **🎵 Audio Analysis & Waveforms**: Beat and BPM detection, automatic beat synchronization, RMS waveform rendering, volume control, and audio fade-in/fade-out.
- **📐 Multi-Aspect Canvas**: 16:9 Landscape (YouTube), 9:16 Vertical (Instagram Reels / TikTok / Shorts), 1:1 Square, and 4:5 Portrait.
- **🚀 High-Quality MP4 Export**: 1080p, 4K, 720p at 24, 30, or 60 FPS encoded in H.264/AAC with real-time background progress reporting.
- **💾 Autosave & Crash Recovery**: Background periodic autosave with startup session restore.
- **↩ Undo / Redo**: Full Command Pattern history stack (`Ctrl+Z`, `Ctrl+Shift+Z`).

---

## 🏛 Architecture

VideoCreator is built with **Clean Architecture**:

```
VideoCreator.sln
├── src/
│   ├── VideoCreator.Core/              # Pure domain models (Timeline, Clips, Keyframes, Effects, Commands, Schema)
│   ├── VideoCreator.Application/       # Application services (Project, AutoCreation, Timeline, ExportQueue)
│   ├── VideoCreator.Media/             # FFmpeg/FFprobe integration, Audio analyzer, Waveforms, Smart Crop
│   ├── VideoCreator.Rendering/         # SkiaSharp preview compositor, Motion engine, Transition shaders, Text renderer
│   ├── VideoCreator.Infrastructure/    # Project persistence, Autosave & recovery, Hardware acceleration, Localization
│   └── VideoCreator.App/               # Avalonia UI 11 desktop app (Home, Quick Create, Studio Editor, Export Dialog)
├── tests/
│   └── VideoCreator.Tests/             # Unit tests, integration tests, and full E2E 1080p video export verification
└── docs/                               # Comprehensive architecture, media engine, timeline, and rendering documentation
```

---

## 🚀 Quick Start

### Prerequisites
- [.NET 8.0 SDK](https://dotnet.microsoft.com/download) or [.NET 9.0 SDK](https://dotnet.microsoft.com/download)
- [FFmpeg](https://ffmpeg.org/) (macOS: `brew install ffmpeg`, Windows: `winget install Gyan.FFmpeg`, Linux: `sudo apt install ffmpeg`)

### Build
```bash
dotnet build VideoCreator.sln
```

### Run Tests (including E2E 1080p Video Generation)
```bash
dotnet test tests/VideoCreator.Tests/VideoCreator.Tests.csproj
```

### Run Application
```bash
dotnet run --project src/VideoCreator.App/VideoCreator.App.csproj
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Space` | Play / Pause Preview |
| `Delete` / `Backspace` | Delete Selected Clip |
| `S` | Split Clip at Playhead |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Ctrl+S` / `Cmd+S` | Save Project |
| `Ctrl+E` / `Cmd+E` | Open Export Dialog |

---

## 📚 Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:
- [Architecture & Layers](docs/architecture.md)
- [Project Schema & Migration](docs/project-format.md)
- [Timeline & Clip System](docs/timeline.md)
- [Media Engine & Audio Analysis](docs/media-engine.md)
- [Rendering & Compositing](docs/rendering.md)
- [Export Pipeline](docs/export.md)
- [Cross-Platform Support](docs/cross-platform.md)
- [Development Guide](docs/development.md)
- [Project Roadmap](docs/roadmap.md)

---

## 📄 License
MIT
