using System;

namespace VideoCreator.Core.Models.Clips;

public class VideoClip : Clip
{
    public string SourceFilePath { get; set; } = string.Empty;
    public double Volume { get; set; } = 1.0;
    public double PlaybackSpeed { get; set; } = 1.0;
    public bool IsMuted { get; set; } = false;
    public int Width { get; set; }
    public int Height { get; set; }
    public TimeSpan SourceDuration { get; set; } = TimeSpan.Zero;

    public VideoClip()
    {
        Name = "Video";
    }

    public VideoClip(string filePath, TimeSpan duration) : this()
    {
        SourceFilePath = filePath;
        Duration = duration;
        SourceDuration = duration;
        Name = System.IO.Path.GetFileNameWithoutExtension(filePath);
    }

    public override Clip Clone()
    {
        var clone = new VideoClip
        {
            SourceFilePath = SourceFilePath,
            Volume = Volume,
            PlaybackSpeed = PlaybackSpeed,
            IsMuted = IsMuted,
            Width = Width,
            Height = Height,
            SourceDuration = SourceDuration
        };
        CopyBasePropertiesTo(clone);
        return clone;
    }
}
