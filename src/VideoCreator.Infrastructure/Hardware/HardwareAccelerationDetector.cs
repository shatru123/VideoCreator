using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using VideoCreator.Media.FFmpeg;

namespace VideoCreator.Infrastructure.Hardware;

public enum HardwareAcceleratorType
{
    CpuFallback,
    AppleVideoToolbox,
    NvidiaNvenc,
    IntelQuickSync,
    AmdAmf
}

public class HardwareAccelerationDetector
{
    public static HardwareAcceleratorType DetectBestAccelerator()
    {
        string ffmpeg = FFmpegLocator.FFmpegPath;
        if (!File.Exists(ffmpeg)) return HardwareAcceleratorType.CpuFallback;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            // Apple VideoToolbox is available on macOS
            return HardwareAcceleratorType.AppleVideoToolbox;
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = ffmpeg,
                Arguments = "-encoders",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = psi };
            process.Start();
            string output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(2000);

            if (output.Contains("h264_nvenc")) return HardwareAcceleratorType.NvidiaNvenc;
            if (output.Contains("h264_qsv")) return HardwareAcceleratorType.IntelQuickSync;
            if (output.Contains("h264_amf")) return HardwareAcceleratorType.AmdAmf;
            if (output.Contains("h264_videotoolbox")) return HardwareAcceleratorType.AppleVideoToolbox;
        }
        catch { }

        return HardwareAcceleratorType.CpuFallback;
    }

    public static string GetRecommendedH264Encoder()
    {
        var accel = DetectBestAccelerator();
        return accel switch
        {
            HardwareAcceleratorType.AppleVideoToolbox => "h264_videotoolbox",
            HardwareAcceleratorType.NvidiaNvenc => "h264_nvenc",
            HardwareAcceleratorType.IntelQuickSync => "h264_qsv",
            HardwareAcceleratorType.AmdAmf => "h264_amf",
            _ => "libx264"
        };
    }
}
