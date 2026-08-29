# Development & Build Guide

## Prerequisites
- .NET 8.0 SDK or .NET 9.0 SDK
- FFmpeg 6.x, 7.x, 8.x, or 9.x (`brew install ffmpeg` on macOS, `winget install Gyan.FFmpeg` on Windows)

## Build Solution
```bash
dotnet build VideoCreator.sln
```

## Run Test Suite
```bash
dotnet test tests/VideoCreator.Tests/VideoCreator.Tests.csproj
```

## Run Desktop Application
```bash
dotnet run --project src/VideoCreator.App/VideoCreator.App.csproj
```
