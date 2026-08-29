using System;
using System.Collections.Generic;

namespace VideoCreator.Media.Models;

public class AudioAnalysisResult
{
    public double Bpm { get; set; } = 120.0;
    public List<TimeSpan> BeatTimestamps { get; set; } = new();
    public List<TimeSpan> StrongBeatTimestamps { get; set; } = new();
    public List<float> EnergyProfile { get; set; } = new();
    public TimeSpan Duration { get; set; } = TimeSpan.Zero;
}
