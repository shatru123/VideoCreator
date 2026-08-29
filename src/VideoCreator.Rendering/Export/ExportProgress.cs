using System;

namespace VideoCreator.Rendering.Export;

public class ExportProgress
{
    public double Percentage { get; set; } = 0.0;
    public int CurrentFrame { get; set; } = 0;
    public int TotalFrames { get; set; } = 0;
    public string Stage { get; set; } = "Initializing";
    public TimeSpan ElapsedTime { get; set; } = TimeSpan.Zero;
    public TimeSpan EstimatedTimeRemaining { get; set; } = TimeSpan.Zero;
}
