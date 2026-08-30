using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using SkiaSharp;
using VideoCreator.Core.Commands;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Media.Validation;
using VideoCreator.Rendering.Export;
using VideoCreator.Rendering.Preview;
using Xunit;

namespace VideoCreator.Tests.EndToEnd;

public class AnimationRegressionTest
{
    [Fact]
    public async Task Export10PhotosWithDistinctAnimations_ShouldRenderCleanly()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_anim_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            var presets = new[]
            {
                MotionPreset.ZoomIn,
                MotionPreset.ZoomOut,
                MotionPreset.PanLeft,
                MotionPreset.PanRight,
                MotionPreset.PanUp,
                MotionPreset.PanDown,
                MotionPreset.KenBurns,
                MotionPreset.DynamicZoom,
                MotionPreset.None,
                MotionPreset.RandomMotion
            };

            var colors = new[]
            {
                SKColors.Red, SKColors.Green, SKColors.Blue, SKColors.Magenta, SKColors.Cyan,
                SKColors.Orange, SKColors.Purple, SKColors.Teal, SKColors.Brown, SKColors.Indigo
            };

            var project = new Project("Animation Regression", AspectRatio.Ratio9x16);
            var videoTrack = project.Timeline.Tracks[0];

            TimeSpan curTime = TimeSpan.Zero;
            for (int i = 0; i < 10; i++)
            {
                string imgPath = Path.Combine(testDir, $"anim_img_{i}.jpg");
                CreateTestImage(imgPath, 1080, 1920, colors[i], $"Photo {i + 1} - {presets[i]}");

                var clip = new ImageClip(imgPath, TimeSpan.FromSeconds(1.5))
                {
                    Motion = presets[i],
                    StartTime = curTime,
                    CropMode = CropMode.BlurBackground
                };
                curTime += clip.Duration;
                videoTrack.Clips.Add(clip);
            }

            // Test Apply to All & Undo
            var undoManager = new UndoRedoManager();
            var allKenBurns = new ApplyAnimationCommand(videoTrack.Clips.OfType<ImageClip>().Select(c => (c, MotionPreset.KenBurns)));
            undoManager.Execute(allKenBurns);

            videoTrack.Clips.OfType<ImageClip>().All(c => c.Motion == MotionPreset.KenBurns).Should().BeTrue();

            // Undo to restore individual animations
            undoManager.Undo();
            for (int i = 0; i < 10; i++)
            {
                videoTrack.Clips[i].As<ImageClip>().Motion.Should().Be(presets[i]);
            }

            // Export to 9:16 Vertical Video
            string outputMp4 = Path.Combine(testDir, "output_anim_test.mp4");
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
            report.ResolutionPass.Should().BeTrue();
            report.DecodePass.Should().BeTrue();
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
            TextSize = 50f,
            IsAntialias = true
        };
        canvas.DrawText(label, 40, height / 2f, paint);

        using var fs = File.OpenWrite(filePath);
        bmp.Encode(fs, SKEncodedImageFormat.Jpeg, 90);
    }
}
