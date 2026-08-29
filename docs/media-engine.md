# Media Engine & Audio Analysis

The Media layer (`VideoCreator.Media`) encapsulates media inspection, thumbnail generation, audio analysis, and smart image cropping behind clean C# interfaces.

## Interfaces

```csharp
public interface IMediaEngine
{
    Task<MediaInfo> InspectAsync(string filePath, CancellationToken ct = default);
    Task<SKBitmap> GenerateThumbnailAsync(string filePath, TimeSpan timestamp, int targetWidth, int targetHeight, CancellationToken ct = default);
    Task<List<float>> GenerateWaveformAsync(string audioFilePath, int samplesCount = 200, CancellationToken ct = default);
    Task<bool> ExtractAudioAsync(string sourcePath, string outputWavPath, CancellationToken ct = default);
}

public interface IAudioAnalyzer
{
    Task<AudioAnalysisResult> AnalyzeAsync(string audioFilePath, CancellationToken ct = default);
}
```

## Audio Analysis & Beat Detection
`AudioAnalyzer` downsamples audio into mono 16-bit PCM at 100Hz and calculates local energy variance using a moving average window. When an energy peak exceeds 135% of the local moving average, a beat onset is recorded. These timestamps drive automatic beat-synchronized video editing.

## Smart Crop & Blur Background
`SmartCropService` handles aspect ratio mismatches (e.g. 16:9 landscape photo inside 9:16 vertical video) by drawing a Gaussian-blurred, darkened copy of the photo across the full canvas, overlaying the sharp uncropped original with a drop shadow.
