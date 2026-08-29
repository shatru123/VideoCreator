using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Rendering.Export;

public class ExportOptions
{
    public string OutputPath { get; set; } = string.Empty;
    public int Width { get; set; } = 1920;
    public int Height { get; set; } = 1080;
    public int Fps { get; set; } = 30;
    public ExportPreset Preset { get; set; } = ExportPreset.HighQuality;
    public string VideoCodec { get; set; } = "libx264";
    public string AudioCodec { get; set; } = "aac";
    public string VideoBitrate { get; set; } = "8M";
    public string AudioBitrate { get; set; } = "192k";

    public static ExportOptions CreateDefault(string outputPath, AspectRatio ratio, int resolution = 1080, int fps = 30)
    {
        var (w, h) = ratio.GetDefaultDimensions(resolution);
        return new ExportOptions
        {
            OutputPath = outputPath,
            Width = w,
            Height = h,
            Fps = fps,
            Preset = ExportPreset.HighQuality
        };
    }
}
