using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Rendering.Preview;

namespace VideoCreator.Rendering.Export;

public class FFmpegExportEngine : IExportEngine
{
    private readonly IPreviewRenderer _renderer;

    public FFmpegExportEngine(IPreviewRenderer? renderer = null)
    {
        _renderer = renderer ?? new PreviewRenderer();
    }

    public async Task<bool> ExportAsync(
        Project project,
        ExportOptions options,
        IProgress<ExportProgress>? progress = null,
        CancellationToken ct = default)
    {
        string ffmpegPath = FFmpegLocator.FFmpegPath;
        if (!File.Exists(ffmpegPath))
            throw new FileNotFoundException("FFmpeg executable not found. Please verify FFmpeg installation.", ffmpegPath);

        string outputDir = Path.GetDirectoryName(options.OutputPath) ?? string.Empty;
        if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }

        if (File.Exists(options.OutputPath))
        {
            File.Delete(options.OutputPath);
        }

        TimeSpan totalDuration = project.Timeline.TotalDuration;
        if (totalDuration <= TimeSpan.Zero)
            totalDuration = TimeSpan.FromSeconds(5.0);

        int fps = options.Fps > 0 ? options.Fps : project.Canvas.Fps;
        int width = options.Width > 0 ? options.Width : project.Canvas.Width;
        int height = options.Height > 0 ? options.Height : project.Canvas.Height;

        // Ensure even dimensions for H.264
        if (width % 2 != 0) width++;
        if (height % 2 != 0) height++;

        int totalFrames = (int)Math.Ceiling(totalDuration.TotalSeconds * fps);
        if (totalFrames <= 0) totalFrames = 1;

        // Find primary audio track if available
        var audioTrack = project.Timeline.Tracks.FirstOrDefault(t => t.Type == TrackType.Audio && !t.IsMuted && t.Clips.Count > 0);
        AudioClip? primaryAudioClip = audioTrack?.Clips.OfType<AudioClip>().FirstOrDefault(a => File.Exists(a.SourceFilePath));

        // Build FFmpeg command arguments
        string ffmpegArgs;
        if (primaryAudioClip != null)
        {
            double audioVolume = (primaryAudioClip.AudioSettings.Volume * (audioTrack?.Volume ?? 1.0));
            double fadeInSec = primaryAudioClip.AudioSettings.FadeInDuration.TotalSeconds;
            double fadeOutSec = primaryAudioClip.AudioSettings.FadeOutDuration.TotalSeconds;
            double totalDurSec = totalDuration.TotalSeconds;
            double fadeOutStart = Math.Max(0.0, totalDurSec - fadeOutSec);

            string audioFilter = $"volume={audioVolume.ToString("0.00", CultureInfo.InvariantCulture)}";
            if (fadeInSec > 0.05)
                audioFilter += $",afade=t=in:ss=0:d={fadeInSec.ToString("0.00", CultureInfo.InvariantCulture)}";
            if (fadeOutSec > 0.05)
                audioFilter += $",afade=t=out:st={fadeOutStart.ToString("0.00", CultureInfo.InvariantCulture)}:d={fadeOutSec.ToString("0.00", CultureInfo.InvariantCulture)}";

            ffmpegArgs = $"-y -f rawvideo -vcodec rawvideo -pix_fmt rgba -s {width}x{height} -r {fps} -i - " +
                         $"-i \"{primaryAudioClip.SourceFilePath}\" " +
                         $"-filter_complex \"[1:a]{audioFilter}[aout]\" " +
                         $"-map 0:v:0 -map \"[aout]\" " +
                         $"-c:v {options.VideoCodec} -pix_fmt yuv420p -b:v {options.VideoBitrate} " +
                         $"-c:a {options.AudioCodec} -b:a {options.AudioBitrate} -ar 44100 " +
                         $"-shortest \"{options.OutputPath}\"";
        }
        else
        {
            // Video only without audio
            ffmpegArgs = $"-y -f rawvideo -vcodec rawvideo -pix_fmt rgba -s {width}x{height} -r {fps} -i - " +
                         $"-c:v {options.VideoCodec} -pix_fmt yuv420p -b:v {options.VideoBitrate} \"{options.OutputPath}\"";
        }

        var psi = new ProcessStartInfo
        {
            FileName = ffmpegPath,
            Arguments = ffmpegArgs,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = psi };
        process.Start();

        var startTime = DateTime.UtcNow;
        var stdin = process.StandardInput.BaseStream;

        byte[] frameBuffer = new byte[width * height * 4];

        for (int frameIdx = 0; frameIdx < totalFrames; frameIdx++)
        {
            ct.ThrowIfCancellationRequested();

            double currentSec = (double)frameIdx / fps;
            var frameTime = TimeSpan.FromSeconds(currentSec);

            using (var bitmap = _renderer.RenderFrame(project, frameTime, width, height))
            {
                var ptr = bitmap.GetPixels();
                Marshal.Copy(ptr, frameBuffer, 0, frameBuffer.Length);
                await stdin.WriteAsync(frameBuffer, 0, frameBuffer.Length, ct);
            }

            if (progress != null && (frameIdx % 5 == 0 || frameIdx == totalFrames - 1))
            {
                var elapsed = DateTime.UtcNow - startTime;
                double pct = (double)(frameIdx + 1) / totalFrames * 100.0;
                double estimatedTotalSec = elapsed.TotalSeconds / Math.Max(1, frameIdx + 1) * totalFrames;
                var remaining = TimeSpan.FromSeconds(Math.Max(0, estimatedTotalSec - elapsed.TotalSeconds));

                progress.Report(new ExportProgress
                {
                    Percentage = Math.Round(pct, 1),
                    CurrentFrame = frameIdx + 1,
                    TotalFrames = totalFrames,
                    Stage = "Rendering & Encoding",
                    ElapsedTime = elapsed,
                    EstimatedTimeRemaining = remaining
                });
            }
        }

        stdin.Close();
        await process.WaitForExitAsync(ct);

        progress?.Report(new ExportProgress
        {
            Percentage = 100.0,
            CurrentFrame = totalFrames,
            TotalFrames = totalFrames,
            Stage = "Complete",
            ElapsedTime = DateTime.UtcNow - startTime,
            EstimatedTimeRemaining = TimeSpan.Zero
        });

        return File.Exists(options.OutputPath) && new FileInfo(options.OutputPath).Length > 0;
    }
}
