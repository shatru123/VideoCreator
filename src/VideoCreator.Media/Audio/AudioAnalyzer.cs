using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Media.FFmpeg;
using VideoCreator.Media.Models;
using VideoCreator.Media.Services;

namespace VideoCreator.Media.Audio;

public class AudioAnalyzer : IAudioAnalyzer
{
    public async Task<AudioAnalysisResult> AnalyzeAsync(string audioFilePath, CancellationToken ct = default)
    {
        var result = new AudioAnalysisResult();

        if (!File.Exists(audioFilePath))
            return result;

        try
        {
            // 1. Get raw PCM audio waveform samples via FFmpeg
            var samples = await ExtractPcmSamplesAsync(audioFilePath, ct);
            if (samples.Count == 0)
            {
                // Fallback default beats
                result.Duration = TimeSpan.FromSeconds(30);
                result.Bpm = 120.0;
                GenerateSyntheticBeats(result, result.Duration, result.Bpm);
                return result;
            }

            result.Duration = TimeSpan.FromSeconds(samples.Count / 100.0); // 100 samples per second
            result.EnergyProfile = samples;

            // 2. Detect peaks / onsets from energy variance
            var beatTimes = DetectBeatsFromEnergy(samples, 100);
            result.BeatTimestamps = beatTimes;

            // 3. Estimate BPM from beat intervals
            if (beatTimes.Count > 4)
            {
                double avgInterval = 0;
                for (int i = 1; i < beatTimes.Count; i++)
                {
                    avgInterval += (beatTimes[i] - beatTimes[i - 1]).TotalSeconds;
                }
                avgInterval /= (beatTimes.Count - 1);
                if (avgInterval > 0.2 && avgInterval < 2.0)
                {
                    result.Bpm = Math.Round(60.0 / avgInterval, 1);
                }
            }

            // 4. Strong beats (every 4th beat for 4/4 time signature)
            for (int i = 0; i < beatTimes.Count; i += 4)
            {
                result.StrongBeatTimestamps.Add(beatTimes[i]);
            }
        }
        catch (Exception)
        {
            // Graceful fallback
            result.Bpm = 120.0;
            result.Duration = TimeSpan.FromSeconds(30);
            GenerateSyntheticBeats(result, result.Duration, result.Bpm);
        }

        return result;
    }

    private static void GenerateSyntheticBeats(AudioAnalysisResult result, TimeSpan duration, double bpm)
    {
        double beatIntervalSec = 60.0 / bpm;
        double current = 0;
        int count = 0;
        while (current < duration.TotalSeconds)
        {
            var ts = TimeSpan.FromSeconds(current);
            result.BeatTimestamps.Add(ts);
            if (count % 4 == 0) result.StrongBeatTimestamps.Add(ts);
            current += beatIntervalSec;
            count++;
        }
    }

    private async Task<List<float>> ExtractPcmSamplesAsync(string audioPath, CancellationToken ct)
    {
        var samples = new List<float>();
        string ffmpeg = FFmpegLocator.FFmpegPath;
        if (!File.Exists(ffmpeg)) return samples;

        // Extract downsampled mono 16-bit PCM at 100Hz
        var psi = new ProcessStartInfo
        {
            FileName = ffmpeg,
            Arguments = $"-v error -i \"{audioPath}\" -ac 1 -ar 100 -f s16le -",
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
            float normalized = Math.Abs(sample) / 32768.0f;
            samples.Add(normalized);
        }

        return samples;
    }

    private static List<TimeSpan> DetectBeatsFromEnergy(List<float> samples, int sampleRateHz)
    {
        var beats = new List<TimeSpan>();
        if (samples.Count < 20) return beats;

        // Moving average threshold
        int windowSize = 20; // 0.2s window
        for (int i = windowSize; i < samples.Count - windowSize; i++)
        {
            float localEnergy = samples[i];
            float avgEnergy = 0;
            for (int j = i - windowSize; j <= i + windowSize; j++)
            {
                avgEnergy += samples[j];
            }
            avgEnergy /= (windowSize * 2 + 1);

            // If sample is local peak and significantly higher than average
            if (localEnergy > avgEnergy * 1.35f && localEnergy > 0.15f)
            {
                // Ensure peak within immediate vicinity
                if (localEnergy >= samples[i - 1] && localEnergy >= samples[i + 1])
                {
                    double timeSec = (double)i / sampleRateHz;
                    if (beats.Count == 0 || (timeSec - beats[^1].TotalSeconds) > 0.25) // Minimum 250ms spacing
                    {
                        beats.Add(TimeSpan.FromSeconds(timeSec));
                    }
                }
            }
        }

        return beats;
    }
}
