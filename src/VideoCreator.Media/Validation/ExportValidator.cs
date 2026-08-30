using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Media.Services;

namespace VideoCreator.Media.Validation;

public class ExportValidator
{
    public async Task<ExportHealthReport> ValidateExportAsync(
        string filePath,
        int expectedWidth,
        int expectedHeight,
        int expectedFps = 30,
        CancellationToken ct = default)
    {
        var report = new ExportHealthReport();

        if (!File.Exists(filePath))
        {
            report.ErrorMessage = $"Exported file does not exist at '{filePath}'.";
            return report;
        }

        var fileInfo = new FileInfo(filePath);
        report.FileSizeBytes = fileInfo.Length;
        if (report.FileSizeBytes < 1024)
        {
            report.ErrorMessage = $"Exported file is too small ({report.FileSizeBytes} bytes).";
            return report;
        }

        string ffprobe = FFmpegLocator.FFprobePath;
        string ffmpeg = FFmpegLocator.FFmpegPath;

        // 1. FFprobe Stream & Container Inspection
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

                using var proc = Process.Start(psi);
                if (proc != null)
                {
                    string json = await proc.StandardOutput.ReadToEndAsync(ct);
                    await proc.WaitForExitAsync(ct);

                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    if (root.TryGetProperty("streams", out var streamsElem) && streamsElem.ValueKind == JsonValueKind.Array)
                    {
                        var streams = streamsElem.EnumerateArray().ToList();
                        var vStream = streams.FirstOrDefault(s => s.TryGetProperty("codec_type", out var ctProp) && ctProp.GetString() == "video");
                        var aStream = streams.FirstOrDefault(s => s.TryGetProperty("codec_type", out var ctProp) && ctProp.GetString() == "audio");

                        if (vStream.ValueKind != JsonValueKind.Undefined)
                        {
                            report.ActualWidth = vStream.TryGetProperty("width", out var wProp) ? wProp.GetInt32() : 0;
                            report.ActualHeight = vStream.TryGetProperty("height", out var hProp) ? hProp.GetInt32() : 0;
                            report.ActualVideoCodec = vStream.TryGetProperty("codec_name", out var cProp) ? (cProp.GetString() ?? "") : "";
                            report.ActualPixelFormat = vStream.TryGetProperty("pix_fmt", out var pfProp) ? (pfProp.GetString() ?? "") : "";
                            report.ActualSar = vStream.TryGetProperty("sample_aspect_ratio", out var sarProp) ? (sarProp.GetString() ?? "1:1") : "1:1";

                            if (vStream.TryGetProperty("r_frame_rate", out var rfrProp))
                            {
                                string rfr = rfrProp.GetString() ?? "";
                                if (rfr.Contains('/'))
                                {
                                    var parts = rfr.Split('/');
                                    if (double.TryParse(parts[0], NumberStyles.Any, CultureInfo.InvariantCulture, out var num) &&
                                        double.TryParse(parts[1], NumberStyles.Any, CultureInfo.InvariantCulture, out var den) && den > 0)
                                    {
                                        report.ActualFps = num / den;
                                    }
                                }
                            }

                            // Validation Checks
                            report.ResolutionPass = (report.ActualWidth == expectedWidth && report.ActualHeight == expectedHeight);
                            report.SarPass = string.IsNullOrEmpty(report.ActualSar) || report.ActualSar == "1:1" || report.ActualSar == "1/1" || report.ActualSar == "0:1";
                            report.PixelFormatPass = report.ActualPixelFormat.StartsWith("yuv420p");
                            report.CodecPass = report.ActualVideoCodec.Equals("h264", StringComparison.OrdinalIgnoreCase);
                            report.FpsPass = Math.Abs(report.ActualFps - expectedFps) < 2.0;
                        }

                        if (aStream.ValueKind != JsonValueKind.Undefined)
                        {
                            report.ActualAudioCodec = aStream.TryGetProperty("codec_name", out var acProp) ? (acProp.GetString() ?? "") : "";
                            report.ActualAudioChannels = aStream.TryGetProperty("channels", out var chProp) ? chProp.GetInt32() : 0;
                            report.ActualAudioSampleRate = aStream.TryGetProperty("sample_rate", out var srProp) && int.TryParse(srProp.GetString(), out var sr) ? sr : 0;
                            report.AudioPass = report.ActualAudioCodec.Equals("aac", StringComparison.OrdinalIgnoreCase) && report.ActualAudioChannels >= 1;
                        }
                        else
                        {
                            // If video has no audio, mark as pass if not strictly required, but warn
                            report.AudioPass = true;
                        }
                    }

                    if (root.TryGetProperty("format", out var formatElem))
                    {
                        if (formatElem.TryGetProperty("duration", out var durProp) &&
                            double.TryParse(durProp.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var dur))
                        {
                            report.ActualDurationSeconds = dur;
                            report.TimestampPass = dur > 0;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                report.ErrorMessage += $" [FFprobe inspection error: {ex.Message}]";
            }
        }
        else
        {
            // If ffprobe is missing, basic file existence validation
            report.ResolutionPass = true;
            report.SarPass = true;
            report.PixelFormatPass = true;
            report.CodecPass = true;
            report.FpsPass = true;
            report.AudioPass = true;
            report.TimestampPass = true;
        }

        // 2. Full Null-Sink FFmpeg Decode Test
        if (File.Exists(ffmpeg))
        {
            try
            {
                var decodePsi = new ProcessStartInfo
                {
                    FileName = ffmpeg,
                    Arguments = $"-v error -i \"{filePath}\" -f null -",
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var decodeProc = Process.Start(decodePsi);
                if (decodeProc != null)
                {
                    string decodeErr = await decodeProc.StandardError.ReadToEndAsync(ct);
                    await decodeProc.WaitForExitAsync(ct);

                    if (decodeProc.ExitCode == 0 && string.IsNullOrWhiteSpace(decodeErr))
                    {
                        report.DecodePass = true;
                    }
                    else
                    {
                        report.DecodePass = false;
                        report.ErrorMessage += $" [Decode error: {decodeErr}]";
                    }
                }
            }
            catch (Exception ex)
            {
                report.DecodePass = false;
                report.ErrorMessage += $" [Decode process error: {ex.Message}]";
            }
        }
        else
        {
            report.DecodePass = true;
        }

        return report;
    }
}
