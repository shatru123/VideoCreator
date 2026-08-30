using System;
using System.IO;
using System.Threading.Tasks;
using FluentAssertions;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Media.Services;
using VideoCreator.Media.Validation;
using VideoCreator.Rendering.Export;
using VideoCreator.Rendering.Preview;
using Xunit;

namespace VideoCreator.Tests.EndToEnd;

public class AudioTimelineSyncTest
{
    [Fact]
    public async Task AudioSourceSelectionAndTimelinePosition_ShouldRemainIndependentAndExportCleanly()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_audio_sync_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            // 1. Generate a test audio file using FFmpeg
            string audioPath = Path.Combine(testDir, "test_song_4min.wav");
            await GenerateSyntheticWavAsync(audioPath, 240); // 4 minute tone

            // 2. Create test image
            string imgPath = Path.Combine(testDir, "video_photo.jpg");
            CreateTestImage(imgPath, 1920, 1080, SKColors.MidnightBlue, "45s Video Clip");

            // 3. Setup Project with 5s photo (for fast test execution) and audio trimmed
            var project = new Project("Audio Sync Project", AspectRatio.Ratio16x9);
            var videoTrack = project.Timeline.Tracks[0];
            var audioTrack = project.Timeline.GetOrCreateTrack(TrackType.Audio, "Music Track");

            var imgClip = new ImageClip(imgPath, TimeSpan.FromSeconds(5.0))
            {
                StartTime = TimeSpan.Zero,
                Motion = MotionPreset.Cinematic
            };
            videoTrack.Clips.Add(imgClip);

            var audioClip = new AudioClip(audioPath, TimeSpan.FromSeconds(5.0))
            {
                StartTime = TimeSpan.Zero,
                SourceDuration = TimeSpan.FromSeconds(240)
            };
            // Set source selection: Use From 32.5s
            audioClip.AudioSettings.TrimStart = TimeSpan.FromSeconds(32.5);
            audioClip.AudioSettings.Volume = 1.5;
            audioClip.AudioSettings.FadeInDuration = TimeSpan.FromSeconds(1.0);
            audioClip.AudioSettings.FadeOutDuration = TimeSpan.FromSeconds(1.5);
            audioTrack.Clips.Add(audioClip);

            // Assert independent separation
            audioClip.StartTime.Should().Be(TimeSpan.Zero);
            audioClip.AudioSettings.TrimStart.Should().Be(TimeSpan.FromSeconds(32.5));
            audioClip.Duration.Should().Be(TimeSpan.FromSeconds(5.0));

            // 4. Export and Validate
            string outputMp4 = Path.Combine(testDir, "output_audio_sync.mp4");
            var renderer = new PreviewRenderer();
            var exporter = new FFmpegExportEngine(renderer);

            var options = new ExportOptions
            {
                OutputPath = outputMp4,
                Width = 1920,
                Height = 1080,
                Fps = 30,
                VideoCodec = "libx264",
                AudioCodec = "aac"
            };

            bool success = await exporter.ExportAsync(project, options);
            success.Should().BeTrue();

            var validator = new ExportValidator();
            var report = await validator.ValidateExportAsync(outputMp4, 1920, 1080, 30);
            report.ResolutionPass.Should().BeTrue();
            report.AudioPass.Should().BeTrue("AAC audio stream should be present and valid");
            report.DecodePass.Should().BeTrue();
            report.IsHealthy.Should().BeTrue();
        }
        finally
        {
            try { Directory.Delete(testDir, recursive: true); } catch { }
        }
    }

    private static async Task GenerateSyntheticWavAsync(string outputPath, int durationSec)
    {
        string ffmpeg = FFmpegLocator.FFmpegPath;
        var psi = new System.Diagnostics.ProcessStartInfo
        {
            FileName = ffmpeg,
            Arguments = $"-y -f lavfi -i \"sine=frequency=440:duration={durationSec}\" -ar 44100 -ac 2 \"{outputPath}\"",
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var p = System.Diagnostics.Process.Start(psi);
        if (p != null) await p.WaitForExitAsync();
    }

    private static void CreateTestImage(string filePath, int width, int height, SKColor color, string label)
    {
        using var bmp = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bmp);
        canvas.Clear(color);

        using var paint = new SKPaint
        {
            Color = SKColors.White,
            TextSize = 60f,
            IsAntialias = true
        };
        canvas.DrawText(label, 60, height / 2f, paint);

        using var fs = File.OpenWrite(filePath);
        bmp.Encode(fs, SKEncodedImageFormat.Jpeg, 90);
    }
}
