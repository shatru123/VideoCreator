using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using FluentAssertions;
using SkiaSharp;
using VideoCreator.Application.AutoCreation;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Templates;
using VideoCreator.Core.Models.Transitions;
using VideoCreator.Core.Serialization;
using VideoCreator.Media.Audio;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Media.Services;
using VideoCreator.Rendering.Export;
using VideoCreator.Rendering.Preview;
using Xunit;

namespace VideoCreator.Tests.EndToEnd;

public class EndToEndVideoCreationTest
{
    [Fact]
    public async Task CompleteVideoCreationSlice_PhotosToExportedPlayableMp4_ShouldSucceed()
    {
        string testDir = Path.Combine(Path.GetTempPath(), $"vc_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(testDir);

        try
        {
            // 1. Generate 10 real test photos
            var photoPaths = new List<string>();
            var colors = new[]
            {
                SKColors.Crimson, SKColors.DodgerBlue, SKColors.SeaGreen, SKColors.Gold,
                SKColors.DarkViolet, SKColors.DarkOrange, SKColors.Teal, SKColors.DeepPink,
                SKColors.RoyalBlue, SKColors.DarkOliveGreen
            };

            for (int i = 0; i < 10; i++)
            {
                string photoPath = Path.Combine(testDir, $"photo_{i + 1:D2}.jpg");
                using var bmp = new SKBitmap(1280, 720);
                using (var canvas = new SKCanvas(bmp))
                {
                    canvas.Clear(colors[i % colors.Length]);

                    using var paint = new SKPaint
                    {
                        Color = SKColors.White,
                        TextSize = 64,
                        IsAntialias = true
                    };
                    canvas.DrawText($"Scene {i + 1}", 480, 380, paint);
                }

                using var stream = File.OpenWrite(photoPath);
                bmp.Encode(stream, SKEncodedImageFormat.Jpeg, 90);
                photoPaths.Add(photoPath);
            }

            // 2. Generate 1 real test audio WAV file (rhythmic beats)
            string audioPath = Path.Combine(testDir, "music_beat.wav");
            GenerateRhythmicTestAudioWav(audioPath, durationSeconds: 20);

            // 3. Setup Auto Video Generator
            var mediaEngine = new FFmpegMediaEngine();
            var audioAnalyzer = new AudioAnalyzer();
            var generator = new AutoVideoGenerator(mediaEngine, audioAnalyzer);

            var template = Template.GetBuiltInTemplates().First(t => t.Id == "template-cinematic");

            var autoOptions = new AutoCreationOptions
            {
                ProjectName = "Acceptance Test Video",
                PhotoFilePaths = photoPaths,
                MusicFilePath = audioPath,
                Template = template,
                AspectRatio = AspectRatio.Ratio9x16,
                TimingMode = TimingMode.Equal,
                TargetPhotoDurationSeconds = 1.5, // 1.5s per photo -> 15s total
                AddTitleOverlay = true,
                CustomTitle = "Cinematic Journey"
            };

            // 4. Generate Timeline
            var project = await generator.GenerateAsync(autoOptions);
            project.Should().NotBeNull();
            project.Canvas.Width.Should().Be(1080);
            project.Canvas.Height.Should().Be(1920);

            var videoTrack = project.Timeline.Tracks.First(t => t.Type == TrackType.Video);
            videoTrack.Clips.Should().HaveCount(10);

            // 5. Edit Timeline
            // Edit Clip 2 duration
            videoTrack.Clips[1].Duration = TimeSpan.FromSeconds(2.0);
            // Change transition on Clip 1
            videoTrack.Clips[0].TransitionOut = new Transition(TransitionType.CrossDissolve, TimeSpan.FromSeconds(0.5));
            // Add custom subtitle
            var overlayTrack = project.Timeline.Tracks.First(t => t.Type == TrackType.Overlay);
            var subtitleClip = new TextClip("Visual Storytelling", TimeSpan.FromSeconds(3.0))
            {
                StartTime = TimeSpan.FromSeconds(4.0)
            };
            overlayTrack.Clips.Add(subtitleClip);

            // 6. Save & Reload Project (Persistence verification)
            string projPath = Path.Combine(testDir, "project.vcproj");
            var serializer = new ProjectSerializer();
            serializer.SerializeToFile(project, projPath);

            var reloadedProject = serializer.DeserializeFromFile(projPath);
            reloadedProject.Metadata.Name.Should().Be("Acceptance Test Video");

            // 7. Preview Rendering Test
            var previewRenderer = new PreviewRenderer();
            using var frameAt0 = previewRenderer.RenderFrame(reloadedProject, TimeSpan.FromSeconds(0.5), 540, 960);
            using var frameAtTransition = previewRenderer.RenderFrame(reloadedProject, TimeSpan.FromSeconds(1.2), 540, 960);

            frameAt0.Width.Should().Be(540);
            frameAt0.Height.Should().Be(960);
            frameAtTransition.Width.Should().Be(540);

            // 8. Final MP4 Export (1080x1920 @ 30fps)
            string outputMp4Path = Path.Combine(testDir, "output_acceptance_test.mp4");
            var exportEngine = new FFmpegExportEngine(previewRenderer);

            var exportOptions = new ExportOptions
            {
                OutputPath = outputMp4Path,
                Width = 1080,
                Height = 1920,
                Fps = 30,
                VideoCodec = "libx264",
                AudioCodec = "aac",
                Preset = ExportPreset.HighQuality
            };

            double lastReportedPct = 0;
            var progress = new Progress<ExportProgress>(p =>
            {
                lastReportedPct = p.Percentage;
            });

            bool exportResult = await exportEngine.ExportAsync(reloadedProject, exportOptions, progress);
            exportResult.Should().BeTrue();
            File.Exists(outputMp4Path).Should().BeTrue();

            var fileInfo = new FileInfo(outputMp4Path);
            fileInfo.Length.Should().BeGreaterThan(50 * 1024); // > 50KB

            // 9. Verify exported MP4 streams with FFprobe
            string ffprobePath = FFmpegLocator.FFprobePath;
            if (File.Exists(ffprobePath))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = ffprobePath,
                    Arguments = $"-v quiet -print_format json -show_format -show_streams \"{outputMp4Path}\"",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var proc = Process.Start(psi);
                proc.Should().NotBeNull();
                string probeJson = await proc!.StandardOutput.ReadToEndAsync();
                await proc.WaitForExitAsync();

                using var doc = JsonDocument.Parse(probeJson);
                var root = doc.RootElement;

                var streams = root.GetProperty("streams").EnumerateArray().ToList();
                var videoStream = streams.FirstOrDefault(s => s.GetProperty("codec_type").GetString() == "video");
                var audioStream = streams.FirstOrDefault(s => s.GetProperty("codec_type").GetString() == "audio");

                videoStream.ValueKind.Should().NotBe(JsonValueKind.Undefined, "Video stream must be present in exported MP4");
                videoStream.GetProperty("codec_name").GetString().Should().Be("h264");
                videoStream.GetProperty("width").GetInt32().Should().Be(1080);
                videoStream.GetProperty("height").GetInt32().Should().Be(1920);

                audioStream.ValueKind.Should().NotBe(JsonValueKind.Undefined, "Audio stream must be present in exported MP4");
                audioStream.GetProperty("codec_name").GetString().Should().Be("aac");
                audioStream.GetProperty("channels").GetInt32().Should().Be(2);

                double duration = double.Parse(root.GetProperty("format").GetProperty("duration").GetString()!, CultureInfo.InvariantCulture);
                duration.Should().BeGreaterThan(5.0);
            }
        }
        finally
        {
            // Cleanup test temporary files
            try { Directory.Delete(testDir, recursive: true); } catch { }
        }
    }

    private static void GenerateRhythmicTestAudioWav(string outputPath, int durationSeconds)
    {
        int sampleRate = 44100;
        int channels = 2;
        int bitsPerSample = 16;
        int totalSamples = sampleRate * durationSeconds;
        int byteRate = sampleRate * channels * (bitsPerSample / 8);
        short blockAlign = (short)(channels * (bitsPerSample / 8));

        using var fs = new FileStream(outputPath, FileMode.Create);
        using var bw = new BinaryWriter(fs);

        // RIFF header
        bw.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
        bw.Write(36 + totalSamples * blockAlign);
        bw.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));

        // fmt chunk
        bw.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
        bw.Write(16); // subchunk1 size
        bw.Write((short)1); // PCM
        bw.Write((short)channels);
        bw.Write(sampleRate);
        bw.Write(byteRate);
        bw.Write(blockAlign);
        bw.Write((short)bitsPerSample);

        // data chunk
        bw.Write(System.Text.Encoding.ASCII.GetBytes("data"));
        bw.Write(totalSamples * blockAlign);

        // Generate synthetic beat audio (440Hz pulse every 0.5s)
        for (int i = 0; i < totalSamples; i++)
        {
            double t = (double)i / sampleRate;
            double beatPhase = t % 0.5; // Beat pulse every 0.5s (120 BPM)
            double envelope = beatPhase < 0.15 ? Math.Exp(-beatPhase * 25.0) : 0.05;
            double sample = Math.Sin(2.0 * Math.PI * 440.0 * t) * envelope * 0.7;

            short val = (short)(sample * 32767.0);
            bw.Write(val); // Left channel
            bw.Write(val); // Right channel
        }
    }
}
