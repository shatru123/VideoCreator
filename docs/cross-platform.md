# Cross-Platform Architecture

VideoCreator is architected for cross-platform expansion:

## Current Support
- **macOS**: Full native support on Apple Silicon (ARM64) and Intel (x64) using Avalonia 11 with Skia rendering and Homebrew / system FFmpeg.
- **Windows**: Native support on Windows 10/11 x64 using Avalonia 11 desktop and FFmpeg.
- **Linux**: Native support on Ubuntu, Fedora, Debian using Avalonia X11/Wayland.

## Future Platforms
- **Web (Blazor / WebAssembly)**: Core domain models, timeline logic, and templates are pure C# and can run in WebAssembly in the browser with WebCodecs or server-side rendering.
- **Mobile (Android & iOS)**: Shared domain and application services with touch-optimized Avalonia / MAUI frontends.
- **Cloud Backend (ASP.NET Core)**: Headless rendering worker reusing `VideoCreator.Rendering` and `VideoCreator.Media`.
