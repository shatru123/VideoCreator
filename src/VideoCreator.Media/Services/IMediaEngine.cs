using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SkiaSharp;
using VideoCreator.Media.Models;

namespace VideoCreator.Media.Services;

public interface IMediaEngine
{
    Task<MediaInfo> InspectAsync(string filePath, CancellationToken ct = default);
    Task<SKBitmap> GenerateThumbnailAsync(string filePath, TimeSpan timestamp, int targetWidth, int targetHeight, CancellationToken ct = default);
    Task<List<float>> GenerateWaveformAsync(string audioFilePath, int samplesCount = 200, CancellationToken ct = default);
    Task<bool> ExtractAudioAsync(string sourcePath, string outputWavPath, CancellationToken ct = default);
}
