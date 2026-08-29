using System;

namespace VideoCreator.Core.Models;

public class AudioSettings
{
    public double Volume { get; set; } = 1.0; // 0.0 to 2.0
    public TimeSpan TrimStart { get; set; } = TimeSpan.Zero;
    public TimeSpan TrimEnd { get; set; } = TimeSpan.Zero;
    public TimeSpan FadeInDuration { get; set; } = TimeSpan.FromSeconds(0.5);
    public TimeSpan FadeOutDuration { get; set; } = TimeSpan.FromSeconds(1.0);
    public TimeSpan StartOffset { get; set; } = TimeSpan.Zero;
    public bool Loop { get; set; } = false;
    public bool IsMuted { get; set; } = false;

    public AudioSettings Clone() => new()
    {
        Volume = Volume,
        TrimStart = TrimStart,
        TrimEnd = TrimEnd,
        FadeInDuration = FadeInDuration,
        FadeOutDuration = FadeOutDuration,
        StartOffset = StartOffset,
        Loop = Loop,
        IsMuted = IsMuted
    };
}
