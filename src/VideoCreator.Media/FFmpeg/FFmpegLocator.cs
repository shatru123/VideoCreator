using System;
using System.IO;
using System.Runtime.InteropServices;

namespace VideoCreator.Media.FFmpeg;

public static class FFmpegLocator
{
    private static string? _cachedFFmpegPath;
    private static string? _cachedFFprobePath;

    public static string FFmpegPath => _cachedFFmpegPath ??= FindExecutable("ffmpeg");
    public static string FFprobePath => _cachedFFprobePath ??= FindExecutable("ffprobe");

    public static bool IsAvailable => !string.IsNullOrEmpty(FFmpegPath) && File.Exists(FFmpegPath);

    public static void SetCustomPaths(string ffmpegPath, string ffprobePath)
    {
        _cachedFFmpegPath = ffmpegPath;
        _cachedFFprobePath = ffprobePath;
    }

    private static string FindExecutable(string name)
    {
        string exeName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? $"{name}.exe" : name;

        // 1. Check environment variables
        string? envVar = Environment.GetEnvironmentVariable(name.ToUpperInvariant() + "_PATH");
        if (!string.IsNullOrEmpty(envVar) && File.Exists(envVar))
            return envVar;

        // 2. Check application directory
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string inApp = Path.Combine(appDir, exeName);
        if (File.Exists(inApp)) return inApp;

        // 3. Check common OS installation paths
        string[] searchPaths;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            searchPaths = new[]
            {
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/opt/local/bin",
                "/usr/bin",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "bin")
            };
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            searchPaths = new[]
            {
                @"C:\ffmpeg\bin",
                @"C:\Program Files\ffmpeg\bin",
                @"C:\Program Files (x86)\ffmpeg\bin",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\WinGet\Links")
            };
        }
        else
        {
            searchPaths = new[]
            {
                "/usr/bin",
                "/usr/local/bin",
                "/snap/bin"
            };
        }

        foreach (var dir in searchPaths)
        {
            string candidate = Path.Combine(dir, exeName);
            if (File.Exists(candidate)) return candidate;
        }

        // 4. Search in PATH environment
        string? pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrEmpty(pathEnv))
        {
            char separator = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? ';' : ':';
            foreach (var dir in pathEnv.Split(separator, StringSplitOptions.RemoveEmptyEntries))
            {
                string candidate = Path.Combine(dir.Trim(), exeName);
                if (File.Exists(candidate)) return candidate;
            }
        }

        return exeName; // Return fallback name
    }
}
