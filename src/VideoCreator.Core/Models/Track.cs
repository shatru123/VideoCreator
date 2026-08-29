using System;
using System.Collections.Generic;
using System.Linq;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Models;

public class Track
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Track";
    public TrackType Type { get; set; } = TrackType.Video;
    public int OrderIndex { get; set; } = 0;
    public bool IsMuted { get; set; } = false;
    public bool IsLocked { get; set; } = false;
    public bool IsSolo { get; set; } = false;
    public double Volume { get; set; } = 1.0;
    public List<Clip> Clips { get; set; } = new();

    public TimeSpan Duration
    {
        get
        {
            if (Clips.Count == 0) return TimeSpan.Zero;
            return Clips.Max(c => c.EndTime);
        }
    }

    public Track() { }

    public Track(string name, TrackType type, int orderIndex = 0)
    {
        Name = name;
        Type = type;
        OrderIndex = orderIndex;
    }

    public Track Clone()
    {
        return new Track(Name, Type, OrderIndex)
        {
            Id = Guid.NewGuid().ToString("N"),
            IsMuted = IsMuted,
            IsLocked = IsLocked,
            IsSolo = IsSolo,
            Volume = Volume,
            Clips = Clips.Select(c => c.Clone()).ToList()
        };
    }
}
