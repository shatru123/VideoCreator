using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Media.Models;

public class MediaInfo
{
    public string FilePath { get; set; } = string.Empty;
    public MediaType Type { get; set; } = MediaType.Image;
    public TimeSpan Duration { get; set; } = TimeSpan.Zero;
    public int Width { get; set; } = 0;
    public int Height { get; set; } = 0;
    public double Fps { get; set; } = 0.0;
    public string VideoCodec { get; set; } = string.Empty;
    public string AudioCodec { get; set; } = string.Empty;
    public int AudioChannels { get; set; } = 0;
    public int SampleRate { get; set; } = 0;
    public long Bitrate { get; set; } = 0;
    public long FileSizeBytes { get; set; } = 0;
}
