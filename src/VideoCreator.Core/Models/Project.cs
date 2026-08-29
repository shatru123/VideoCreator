using System;
using System.Collections.Generic;
using System.Linq;

namespace VideoCreator.Core.Models;

public class Project
{
    public const int CurrentSchemaVersion = 1;

    public int SchemaVersion { get; set; } = CurrentSchemaVersion;
    public ProjectMetadata Metadata { get; set; } = new();
    public CanvasSettings Canvas { get; set; } = new();
    public Timeline Timeline { get; set; } = new();
    public List<Asset> Assets { get; set; } = new();
    public Dictionary<string, string> Settings { get; set; } = new();

    public Project() { }

    public Project(string name, Enums.AspectRatio aspectRatio = Enums.AspectRatio.Ratio16x9, int fps = 30)
    {
        Metadata.Name = name;
        Canvas = new CanvasSettings(aspectRatio, fps);
        Timeline = new Timeline();

        // Default tracks
        Timeline.Tracks.Add(new Track("Video", Enums.TrackType.Video, 0));
        Timeline.Tracks.Add(new Track("Overlays", Enums.TrackType.Overlay, 1));
        Timeline.Tracks.Add(new Track("Audio", Enums.TrackType.Audio, 2));
    }

    public Project Clone()
    {
        return new Project
        {
            SchemaVersion = SchemaVersion,
            Metadata = Metadata.Clone(),
            Canvas = Canvas.Clone(),
            Timeline = Timeline.Clone(),
            Assets = Assets.Select(a => a.Clone()).ToList(),
            Settings = new Dictionary<string, string>(Settings)
        };
    }
}
