using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using VideoCreator.Media.FFmpeg;

namespace VideoCreator.Media.Services;

public class AudioPlayerService : IAudioPlayerService
{
    private Process? _playbackProcess;
    private readonly object _lock = new();

    public bool IsPlaying { get; private set; }

    public void Play(string filePath, TimeSpan startTime, double volume = 1.0)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return;

        Stop();

        lock (_lock)
        {
            try
            {
                string ffplayPath = FindFFplay();
                int vol = Math.Clamp((int)(volume * 100), 0, 100);
                string startSec = startTime.TotalSeconds.ToString("0.###", CultureInfo.InvariantCulture);

                if (!string.IsNullOrEmpty(ffplayPath) && File.Exists(ffplayPath))
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = ffplayPath,
                        Arguments = $"-nodisp -autoexit -ss {startSec} -volume {vol} -loglevel quiet \"{filePath}\"",
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    _playbackProcess = Process.Start(psi);
                    IsPlaying = true;
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX) && File.Exists("/usr/bin/afplay"))
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "/usr/bin/afplay",
                        Arguments = $"-v {volume.ToString("0.##", CultureInfo.InvariantCulture)} \"{filePath}\"",
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    _playbackProcess = Process.Start(psi);
                    IsPlaying = true;
                }
            }
            catch
            {
                IsPlaying = false;
            }
        }
    }

    public void Pause()
    {
        Stop();
    }

    public void Stop()
    {
        lock (_lock)
        {
            try
            {
                if (_playbackProcess != null && !_playbackProcess.HasExited)
                {
                    _playbackProcess.Kill();
                    _playbackProcess.Dispose();
                }
            }
            catch { }
            finally
            {
                _playbackProcess = null;
                IsPlaying = false;
            }
        }
    }

    public void SetVolume(double volume)
    {
        // Volume updated on next play call
    }

    private static string FindFFplay()
    {
        string ffmpegPath = FFmpegLocator.FFmpegPath;
        if (!string.IsNullOrEmpty(ffmpegPath))
        {
            string dir = Path.GetDirectoryName(ffmpegPath) ?? "";
            string candidate = Path.Combine(dir, "ffplay");
            if (File.Exists(candidate)) return candidate;
            candidate = Path.Combine(dir, "ffplay.exe");
            if (File.Exists(candidate)) return candidate;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            if (File.Exists("/opt/homebrew/bin/ffplay")) return "/opt/homebrew/bin/ffplay";
            if (File.Exists("/usr/local/bin/ffplay")) return "/usr/local/bin/ffplay";
        }
        return "ffplay";
    }

    public void Dispose()
    {
        Stop();
    }
}
