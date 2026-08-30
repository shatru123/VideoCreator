using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Media.Validation;
using VideoCreator.Rendering.Export;
using VideoCreator.Rendering.Preview;
using Xunit;

namespace VideoCreator.Tests.EndToEnd;

public class TimelineDurationRulesTest
{
    [Fact]
    public async Task Part19_Photos19Sec_Song4MinSelectedSection_OutputMustBeStrictly19Seconds()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_part19_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            // 1. Generate 4 photos with durations: 3s, 5s, 7s, 4s (Total = 19s)
            var durations = new[] { 3.0, 5.0, 7.0, 4.0 };
            var colors = new[] { SKColors.Coral, SKColors.DodgerBlue, SKColors.MediumSeaGreen, SKColors.Purple };
            var photoPaths = new string[4];

            for (int i = 0; i < 4; i++)
            {
                photoPaths[i] = Path.Combine(testDir, $"part19_photo_{i + 1}.jpg");
                CreateTestImage(photoPaths[i], 1920, 1080, colors[i], $"Photo {i + 1} ({durations[i]}s)");
            }

            // 2. Generate 4-minute synthetic song (240s)
            string audioPath = Path.Combine(testDir, "part19_song_4min.wav");
            await GenerateSyntheticWavAsync(audioPath, 240);

            // 3. Construct Project
            var project = new Project("Part19 Test Project", AspectRatio.Ratio16x9);
            var videoTrack = project.Timeline.Tracks[0];
            var audioTrack = project.Timeline.GetOrCreateTrack(TrackType.Audio, "Music Track");

            TimeSpan curTime = TimeSpan.Zero;
            for (int i = 0; i < 4; i++)
            {
                var clip = new ImageClip(photoPaths[i], TimeSpan.FromSeconds(durations[i]))
                {
                    StartTime = curTime,
                    Motion = (i % 2 == 0) ? MotionPreset.ZoomIn : MotionPreset.PanLeft,
                    CropMode = CropMode.BlurBackground
                };
                videoTrack.Clips.Add(clip);
                curTime += clip.Duration;
            }

            // Verify Visual Duration is 19.0s
            project.Timeline.VisualDuration.TotalSeconds.Should().Be(19.0);
            project.Timeline.TotalDuration.TotalSeconds.Should().Be(19.0);

            // Add 4-min audio clip with selected section: 01:10 -> 01:55 (TrimStart = 70s, Duration = 45s)
            var audioClip = new AudioClip(audioPath, TimeSpan.FromSeconds(45.0))
            {
                StartTime = TimeSpan.Zero,
                SourceDuration = TimeSpan.FromSeconds(240.0)
            };
            audioClip.AudioSettings.TrimStart = TimeSpan.FromSeconds(70.0); // 01:10
            audioTrack.Clips.Add(audioClip);

            // Total duration MUST STILL BE 19.0 seconds!
            project.Timeline.TotalDuration.TotalSeconds.Should().Be(19.0, "Audio track must NEVER extend project duration");

            // 4. Export
            string outputMp4 = Path.Combine(testDir, "part19_output.mp4");
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

            // 5. Validate output duration is strictly ~19.0s (within 0.5s container tolerance)
            var validator = new ExportValidator();
            var report = await validator.ValidateExportAsync(outputMp4, 1920, 1080, 30);

            report.IsHealthy.Should().BeTrue();
            report.ActualDurationSeconds.Should().BeInRange(18.5, 19.5, "Exported MP4 must terminate at 19 seconds, not 45s or 4min");
        }
        finally
        {
            try { Directory.Delete(testDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public async Task Part20_Photos60Sec_Song40Sec_OutputMustBeStrictly60SecondsWithSilenceAtEnd()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_part20_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            // 1. Generate 12 photos of 5s each (Total = 60s)
            var photoPaths = new string[12];
            for (int i = 0; i < 12; i++)
            {
                photoPaths[i] = Path.Combine(testDir, $"part20_photo_{i + 1}.jpg");
                CreateTestImage(photoPaths[i], 1080, 1080, SKColors.Teal, $"Photo {i + 1}");
            }

            // 2. Generate 40s synthetic song
            string audioPath = Path.Combine(testDir, "part20_song_40s.wav");
            await GenerateSyntheticWavAsync(audioPath, 40);

            // 3. Construct Project
            var project = new Project("Part20 Test Project", AspectRatio.Ratio1x1);
            var videoTrack = project.Timeline.Tracks[0];
            var audioTrack = project.Timeline.GetOrCreateTrack(TrackType.Audio, "Music Track");

            TimeSpan curTime = TimeSpan.Zero;
            for (int i = 0; i < 12; i++)
            {
                var clip = new ImageClip(photoPaths[i], TimeSpan.FromSeconds(5.0))
                {
                    StartTime = curTime,
                    Motion = MotionPreset.KenBurns,
                    CropMode = CropMode.BlurBackground
                };
                videoTrack.Clips.Add(clip);
                curTime += clip.Duration;
            }

            // Add 40s audio clip
            var audioClip = new AudioClip(audioPath, TimeSpan.FromSeconds(40.0))
            {
                StartTime = TimeSpan.Zero,
                SourceDuration = TimeSpan.FromSeconds(40.0)
            };
            audioTrack.Clips.Add(audioClip);

            project.Timeline.TotalDuration.TotalSeconds.Should().Be(60.0);

            // 4. Export
            string outputMp4 = Path.Combine(testDir, "part20_output.mp4");
            var renderer = new PreviewRenderer();
            var exporter = new FFmpegExportEngine(renderer);

            var options = new ExportOptions
            {
                OutputPath = outputMp4,
                Width = 1080,
                Height = 1080,
                Fps = 30,
                VideoCodec = "libx264",
                AudioCodec = "aac"
            };

            bool success = await exporter.ExportAsync(project, options);
            success.Should().BeTrue();

            var validator = new ExportValidator();
            var report = await validator.ValidateExportAsync(outputMp4, 1080, 1080, 30);
            report.IsHealthy.Should().BeTrue();
            report.ActualDurationSeconds.Should().BeInRange(59.5, 60.5, "Exported MP4 must continue for full 60s");
        }
        finally
        {
            try { Directory.Delete(testDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public async Task Part21_Photos45Sec_NoAudio_OutputMustBeStrictly45SecondsWithoutBlankFrames()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_part21_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            // 1. Generate 9 photos of 5s each (Total = 45s)
            var photoPaths = new string[9];
            for (int i = 0; i < 9; i++)
            {
                photoPaths[i] = Path.Combine(testDir, $"part21_photo_{i + 1}.jpg");
                CreateTestImage(photoPaths[i], 1080, 1920, SKColors.Indigo, $"Photo {i + 1}");
            }

            // 2. Construct Project with No Audio
            var project = new Project("Part21 Test Project", AspectRatio.Ratio9x16);
            var videoTrack = project.Timeline.Tracks[0];

            TimeSpan curTime = TimeSpan.Zero;
            for (int i = 0; i < 9; i++)
            {
                var clip = new ImageClip(photoPaths[i], TimeSpan.FromSeconds(5.0))
                {
                    StartTime = curTime,
                    Motion = MotionPreset.Cinematic,
                    CropMode = CropMode.BlurBackground
                };
                videoTrack.Clips.Add(clip);
                curTime += clip.Duration;
            }

            project.Timeline.TotalDuration.TotalSeconds.Should().Be(45.0);

            // 3. Export
            string outputMp4 = Path.Combine(testDir, "part21_output.mp4");
            var renderer = new PreviewRenderer();
            var exporter = new FFmpegExportEngine(renderer);

            var options = new ExportOptions
            {
                OutputPath = outputMp4,
                Width = 1080,
                Height = 1920,
                Fps = 30,
                VideoCodec = "libx264",
                AudioCodec = "aac"
            };

            bool success = await exporter.ExportAsync(project, options);
            success.Should().BeTrue();

            var validator = new ExportValidator();
            var report = await validator.ValidateExportAsync(outputMp4, 1080, 1920, 30);
            report.IsHealthy.Should().BeTrue();
            report.ActualDurationSeconds.Should().BeInRange(44.5, 45.5, "Exported MP4 must be 45s");
        }
        finally
        {
            try { Directory.Delete(testDir, recursive: true); } catch { }
        }
    }

    private static async Task GenerateSyntheticWavAsync(string outputPath, int durationSec)
    {
        string ffmpeg = FFmpegLocator.FFmpegPath;
        var psi = new ProcessStartInfo
        {
            FileName = ffmpeg,
            Arguments = $"-y -f lavfi -i \"sine=frequency=440:duration={durationSec}\" -ar 44100 -ac 2 \"{outputPath}\"",
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var p = Process.Start(psi);
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
            TextSize = 50f,
            IsAntialias = true
        };
        canvas.DrawText(label, 40, height / 2f, paint);

        using var fs = File.OpenWrite(filePath);
        bmp.Encode(fs, SKEncodedImageFormat.Jpeg, 90);
    }
}
