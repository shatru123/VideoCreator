using System.Collections.Generic;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Templates;

namespace VideoCreator.Application.AutoCreation;

public enum TimingMode
{
    Auto,      // Optimizes photo durations based on music length and count
    Equal,     // Equal duration for all photos
    BeatSync,  // Synchronizes photo cuts to detected audio beats
    Manual     // Explicit duration per photo
}

public class AutoCreationOptions
{
    public string ProjectName { get; set; } = "My Video";
    public List<string> PhotoFilePaths { get; set; } = new();
    public string? MusicFilePath { get; set; }
    public Template? Template { get; set; }
    public AspectRatio AspectRatio { get; set; } = AspectRatio.Ratio9x16;
    public TimingMode TimingMode { get; set; } = TimingMode.Auto;
    public double TargetPhotoDurationSeconds { get; set; } = 3.5;
    public bool AddTitleOverlay { get; set; } = true;
    public string? CustomTitle { get; set; }
}
