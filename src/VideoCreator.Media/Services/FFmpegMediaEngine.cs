using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Media.Models;

namespace VideoCreator.Media.Services;

public class FFmpegMediaEngine : IMediaEngine
{
    public async Task<MediaInfo> InspectAsync(string filePath, CancellationToken ct = default)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException("Media file does not exist.", filePath);

        var info = new MediaInfo
        {
            FilePath = filePath,
            FileSizeBytes = new FileInfo(filePath).Length
        };

        string ext = Path.GetExtension(filePath).ToLowerInvariant();
        if (ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".bmp" or ".gif")
        {
            info.Type = MediaType.Image;
            try
            {
                using var codec = SKCodec.Create(filePath);
                if (codec != null)
                {
                    info.Width = codec.Info.Width;
                    info.Height = codec.Info.Height;
                    info.Duration = TimeSpan.FromSeconds(3.0); // Default photo duration
                    return info;
                }
            }
            catch { }
        }

        // Use FFprobe for video/audio or advanced inspection
        string ffprobe = FFmpegLocator.FFprobePath;
        if (File.Exists(ffprobe))
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = ffprobe,
                    Arguments = $"-v quiet -print_format json -show_format -show_streams \"{filePath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = psi };
                process.Start();
                string output = await process.StandardOutput.ReadToEndAsync(ct);
                await process.WaitForExitAsync(ct);

                using var doc = JsonDocument.Parse(output);
                var root = doc.RootElement;

                if (root.TryGetProperty("format", out var format))
                {
                    if (format.TryGetProperty("duration", out var durProp) && double.TryParse(durProp.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out double durationSec))
                    {
                        info.Duration = TimeSpan.FromSeconds(durationSec);
                    }
                    if (format.TryGetProperty("bit_rate", out var bitRateProp) && long.TryParse(bitRateProp.GetString(), out long bitrate))
                    {
                        info.Bitrate = bitrate;
                    }
                }

                if (root.TryGetProperty("streams", out var streams))
                {
                    foreach (var stream in streams.EnumerateArray())
                    {
                        string codecType = stream.GetProperty("codec_type").GetString() ?? "";
                        if (codecType == "video" && info.Width == 0)
                        {
                            info.Type = ext is ".jpg" or ".jpeg" or ".png" or ".webp" ? MediaType.Image : MediaType.Video;
                            if (stream.TryGetProperty("width", out var w)) info.Width = w.GetInt32();
                            if (stream.TryGetProperty("height", out var h)) info.Height = h.GetInt32();
                            if (stream.TryGetProperty("codec_name", out var cName)) info.VideoCodec = cName.GetString() ?? "";
                            if (stream.TryGetProperty("r_frame_rate", out var rFps))
                            {
                                string fpsStr = rFps.GetString() ?? "30/1";
                                var parts = fpsStr.Split('/');
                                if (parts.Length == 2 && double.TryParse(parts[0], out double num) && double.TryParse(parts[1], out double den) && den > 0)
                                {
                                    info.Fps = num / den;
                                }
                            }
                        }
                        else if (codecType == "audio")
                        {
                            if (info.Type != MediaType.Video) info.Type = MediaType.Audio;
                            if (stream.TryGetProperty("codec_name", out var aCodec)) info.AudioCodec = aCodec.GetString() ?? "";
                            if (stream.TryGetProperty("channels", out var ch)) info.AudioChannels = ch.GetInt32();
                            if (stream.TryGetProperty("sample_rate", out var sr) && int.TryParse(sr.GetString(), out int sampleRate)) info.SampleRate = sampleRate;
                        }
                    }
                }
            }
            catch
            {
                // Fallback for image loading with SkiaSharp
                if (info.Type == MediaType.Image && info.Width == 0)
                {
                    using var bitmap = SKBitmap.Decode(filePath);
                    if (bitmap != null)
                    {
                        info.Width = bitmap.Width;
                        info.Height = bitmap.Height;
                    }
                }
            }
        }

        return info;
    }

    public async Task<SKBitmap> GenerateThumbnailAsync(string filePath, TimeSpan timestamp, int targetWidth, int targetHeight, CancellationToken ct = default)
    {
        if (!File.Exists(filePath))
            return new SKBitmap(targetWidth, targetHeight);

        string ext = Path.GetExtension(filePath).ToLowerInvariant();
        if (ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".bmp")
        {
            return await Task.Run(() =>
            {
                using var original = SKBitmap.Decode(filePath);
                if (original == null) return new SKBitmap(targetWidth, targetHeight);

                float scale = Math.Min((float)targetWidth / original.Width, (float)targetHeight / original.Height);
                int scaledW = Math.Max(1, (int)(original.Width * scale));
                int scaledH = Math.Max(1, (int)(original.Height * scale));

                var thumb = new SKBitmap(scaledW, scaledH);
                original.ScalePixels(thumb, SKFilterQuality.Medium);
                return thumb;
            }, ct);
        }

        // For video files: use FFmpeg frame extraction
        string ffmpeg = FFmpegLocator.FFmpegPath;
        if (File.Exists(ffmpeg))
        {
            string tempThumb = Path.Combine(Path.GetTempPath(), $"thumb_{Guid.NewGuid():N}.jpg");
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = ffmpeg,
                    Arguments = $"-ss {timestamp.TotalSeconds.ToString("0.00", CultureInfo.InvariantCulture)} -i \"{filePath}\" -vframes 1 -vf \"scale={targetWidth}:{targetHeight}:force_original_aspect_ratio=decrease\" -q:v 2 \"{tempThumb}\" -y",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = psi };
                process.Start();
                await process.WaitForExitAsync(ct);

                if (File.Exists(tempThumb))
                {
                    var bitmap = SKBitmap.Decode(tempThumb);
                    if (bitmap != null) return bitmap;
                }
            }
            finally
            {
                if (File.Exists(tempThumb)) File.Delete(tempThumb);
            }
        }

        return new SKBitmap(targetWidth, targetHeight);
    }

    public async Task<List<float>> GenerateWaveformAsync(string audioFilePath, int samplesCount = 200, CancellationToken ct = default)
    {
        var waveform = new List<float>();
        if (!File.Exists(audioFilePath)) return waveform;

        string ffmpeg = FFmpegLocator.FFmpegPath;
        if (!File.Exists(ffmpeg))
        {
            // Synthetic waveform fallback
            var rnd = new Random(audioFilePath.GetHashCode());
            for (int i = 0; i < samplesCount; i++)
            {
                waveform.Add((float)(0.2 + 0.6 * rnd.NextDouble()));
            }
            return waveform;
        }

        try
        {
            // Extract raw PCM at rate = samplesCount per total duration
            var info = await InspectAsync(audioFilePath, ct);
            double durationSec = Math.Max(1.0, info.Duration.TotalSeconds);
            int sampleRate = Math.Max(10, (int)(samplesCount / durationSec));

            var psi = new ProcessStartInfo
            {
                FileName = ffmpeg,
                Arguments = $"-v error -i \"{audioFilePath}\" -ac 1 -ar {sampleRate} -f s16le -",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            using var ms = new MemoryStream();
            await process.StandardOutput.BaseStream.CopyToAsync(ms, ct);
            await process.WaitForExitAsync(ct);

            byte[] raw = ms.ToArray();
            for (int i = 0; i < raw.Length - 1; i += 2)
            {
                short sample = BitConverter.ToInt16(raw, i);
                float val = Math.Abs(sample) / 32768.0f;
                waveform.Add(val);
            }

            // Resample to target samplesCount if needed
            if (waveform.Count > samplesCount && samplesCount > 0)
            {
                var resampled = new List<float>(samplesCount);
                double step = (double)waveform.Count / samplesCount;
                for (int i = 0; i < samplesCount; i++)
                {
                    int idx = (int)(i * step);
                    resampled.Add(waveform[Math.Clamp(idx, 0, waveform.Count - 1)]);
                }
                return resampled;
            }
        }
        catch
        {
            var rnd = new Random(42);
            for (int i = 0; i < samplesCount; i++) waveform.Add((float)(0.2 + 0.5 * rnd.NextDouble()));
        }

        return waveform;
    }

    public async Task<bool> ExtractAudioAsync(string sourcePath, string outputWavPath, CancellationToken ct = default)
    {
        string ffmpeg = FFmpegLocator.FFmpegPath;
        if (!File.Exists(ffmpeg) || !File.Exists(sourcePath)) return false;

        var psi = new ProcessStartInfo
        {
            FileName = ffmpeg,
            Arguments = $"-v error -i \"{sourcePath}\" -vn -acodec pcm_s16le -ar 44100 -ac 2 \"{outputWavPath}\" -y",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = psi };
        process.Start();
        await process.WaitForExitAsync(ct);
        return File.Exists(outputWavPath);
    }
}
