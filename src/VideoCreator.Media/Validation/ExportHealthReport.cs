using System;

namespace VideoCreator.Media.Validation;

public class ExportHealthReport
{
    public bool IsHealthy => ResolutionPass && FpsPass && SarPass && PixelFormatPass && CodecPass && AudioPass && DecodePass;

    public bool ResolutionPass { get; set; }
    public bool FpsPass { get; set; }
    public bool SarPass { get; set; }
    public bool PixelFormatPass { get; set; }
    public bool CodecPass { get; set; }
    public bool AudioPass { get; set; }
    public bool TimestampPass { get; set; }
    public bool DecodePass { get; set; }

    public int ActualWidth { get; set; }
    public int ActualHeight { get; set; }
    public double ActualFps { get; set; }
    public string ActualSar { get; set; } = string.Empty;
    public string ActualPixelFormat { get; set; } = string.Empty;
    public string ActualVideoCodec { get; set; } = string.Empty;
    public string ActualAudioCodec { get; set; } = string.Empty;
    public int ActualAudioChannels { get; set; }
    public int ActualAudioSampleRate { get; set; }
    public double ActualDurationSeconds { get; set; }
    public long FileSizeBytes { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;

    public override string ToString()
    {
        return $"[Export Health Report: {(IsHealthy ? "PASS" : "FAIL")}] " +
               $"Res: {ActualWidth}x{ActualHeight} ({(ResolutionPass ? "PASS" : "FAIL")}), " +
               $"FPS: {ActualFps:F1} ({(FpsPass ? "PASS" : "FAIL")}), " +
               $"SAR: {ActualSar} ({(SarPass ? "PASS" : "FAIL")}), " +
               $"PixelFormat: {ActualPixelFormat} ({(PixelFormatPass ? "PASS" : "FAIL")}), " +
               $"VideoCodec: {ActualVideoCodec} ({(CodecPass ? "PASS" : "FAIL")}), " +
               $"Audio: {ActualAudioCodec}/{ActualAudioChannels}ch/{ActualAudioSampleRate}Hz ({(AudioPass ? "PASS" : "FAIL")}), " +
               $"Decode: {(DecodePass ? "PASS" : "FAIL")}";
    }
}
