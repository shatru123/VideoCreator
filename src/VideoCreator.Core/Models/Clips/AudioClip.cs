using System;

namespace VideoCreator.Core.Models.Clips;

public class AudioClip : Clip
{
    public string SourceFilePath { get; set; } = string.Empty;
    public AudioSettings AudioSettings { get; set; } = new();
    public TimeSpan SourceDuration { get; set; } = TimeSpan.Zero;
    public List<float> WaveformData { get; set; } = new();

    public AudioClip()
    {
        Name = "Audio";
    }

    public AudioClip(string filePath, TimeSpan duration) : this()
    {
        SourceFilePath = filePath;
        Duration = duration;
        SourceDuration = duration;
        Name = System.IO.Path.GetFileNameWithoutExtension(filePath);
    }

    public override Clip Clone()
    {
        var clone = new AudioClip
        {
            SourceFilePath = SourceFilePath,
            AudioSettings = AudioSettings.Clone(),
            SourceDuration = SourceDuration,
            WaveformData = new List<float>(WaveformData)
        };
        CopyBasePropertiesTo(clone);
        return clone;
    }
}
