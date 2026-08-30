using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using FluentAssertions;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Transitions;
using VideoCreator.Media.Validation;
using VideoCreator.Rendering.Export;
using VideoCreator.Rendering.Preview;
using Xunit;

namespace VideoCreator.Tests.EndToEnd;

public class CroppingRegressionTest
{
    [Fact]
    public async Task ExportMixedAspectImages_ShouldMaintainStrictResolutionAndPassFullDecode()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_crop_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            // 1. Create 6 mixed aspect ratio photos
            // Photo 1: Landscape (1920x1080)
            string p1 = Path.Combine(testDir, "photo1_landscape.jpg");
            CreateTestImage(p1, 1920, 1080, SKColors.Crimson, "1. Landscape 1920x1080");

            // Photo 2: Portrait (1080x1920)
            string p2 = Path.Combine(testDir, "photo2_portrait.jpg");
            CreateTestImage(p2, 1080, 1920, SKColors.DodgerBlue, "2. Portrait 1080x1920");

            // Photo 3: Square (1080x1080)
            string p3 = Path.Combine(testDir, "photo3_square.jpg");
            CreateTestImage(p3, 1080, 1080, SKColors.SeaGreen, "3. Square 1080x1080");

            // Photo 4: Ultra-wide (2560x1080)
            string p4 = Path.Combine(testDir, "photo4_ultrawide.jpg");
            CreateTestImage(p4, 2560, 1080, SKColors.DarkOrange, "4. UltraWide 2560x1080");

            // Photo 5: Small Portrait (720x1280)
            string p5 = Path.Combine(testDir, "photo5_smallportrait.jpg");
            CreateTestImage(p5, 720, 1280, SKColors.DarkViolet, "5. Small 720x1280");

            // Photo 6: Standard Photo (1280x720) with rotation
            string p6 = Path.Combine(testDir, "photo6_rotated.jpg");
            CreateTestImage(p6, 1280, 720, SKColors.Gold, "6. Rotated 90 deg");

            // 2. Build 1080x1080 Square Project
            var project = new Project("Cropping Regression Project", AspectRatio.Ratio1x1);
            var videoTrack = project.Timeline.Tracks[0];

            var clip1 = new ImageClip(p1, TimeSpan.FromSeconds(2.0)) { Motion = MotionPreset.ZoomIn, CropMode = CropMode.BlurBackground };
            var clip2 = new ImageClip(p2, TimeSpan.FromSeconds(2.5)) { Motion = MotionPreset.PanLeft, CropMode = CropMode.BlurBackground, TransitionOut = new Transition(TransitionType.CrossDissolve, TimeSpan.FromSeconds(0.5)) };
            var clip3 = new ImageClip(p3, TimeSpan.FromSeconds(1.5)) { Motion = MotionPreset.KenBurns, CropMode = CropMode.BlurBackground };
            var clip4 = new ImageClip(p4, TimeSpan.FromSeconds(2.0)) { Motion = MotionPreset.DynamicZoom, CropMode = CropMode.BlurBackground };
            var clip5 = new ImageClip(p5, TimeSpan.FromSeconds(2.0)) { Motion = MotionPreset.SlowZoomOut, CropMode = CropMode.BlurBackground };
            var clip6 = new ImageClip(p6, TimeSpan.FromSeconds(2.0)) { Motion = MotionPreset.Cinematic, CropMode = CropMode.BlurBackground };
            clip6.Transform.RotationDegrees = 90.0;

            var clips = new[] { clip1, clip2, clip3, clip4, clip5, clip6 };
            TimeSpan curTime = TimeSpan.Zero;
            foreach (var clip in clips)
            {
                clip.StartTime = curTime;
                curTime += clip.Duration;
                videoTrack.Clips.Add(clip);
            }

            // 3. Render and Export via FFmpegExportEngine
            string outputMp4 = Path.Combine(testDir, "output_crop_test.mp4");
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
            success.Should().BeTrue("Export must succeed");

            // 4. Validate output with ExportValidator
            var validator = new ExportValidator();
            var report = await validator.ValidateExportAsync(outputMp4, 1080, 1080, 30);

            report.ResolutionPass.Should().BeTrue($"Resolution must be 1080x1080 (actual: {report.ActualWidth}x{report.ActualHeight})");
            report.SarPass.Should().BeTrue($"SAR must be 1:1 (actual: {report.ActualSar})");
            report.PixelFormatPass.Should().BeTrue($"Pixel format must be yuv420p (actual: {report.ActualPixelFormat})");
            report.CodecPass.Should().BeTrue($"Video codec must be h264 (actual: {report.ActualVideoCodec})");
            report.DecodePass.Should().BeTrue($"Decode validation must pass without errors (error: {report.ErrorMessage})");
            report.IsHealthy.Should().BeTrue();
        }
        finally
        {
            try { Directory.Delete(testDir, recursive: true); } catch { }
        }
    }

    private static void CreateTestImage(string filePath, int width, int height, SKColor color, string label)
    {
        using var bmp = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bmp);
        canvas.Clear(color);

        using var paint = new SKPaint
        {
            Color = SKColors.White,
            TextSize = Math.Min(width, height) / 12f,
            IsAntialias = true
        };
        canvas.DrawText(label, 40, height / 2f, paint);

        using var fs = File.OpenWrite(filePath);
        bmp.Encode(fs, SKEncodedImageFormat.Jpeg, 90);
    }
}
