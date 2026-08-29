using System;
using System.Collections.Generic;
using System.Linq;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Models;

public class Timeline
{
    public List<Track> Tracks { get; set; } = new();
    public TimeSpan PlayheadPosition { get; set; } = TimeSpan.Zero;

    public TimeSpan TotalDuration
    {
        get
        {
            if (Tracks.Count == 0) return TimeSpan.Zero;
            return Tracks.Max(t => t.Duration);
        }
    }

    public Track GetOrCreateTrack(TrackType type, string name)
    {
        var track = Tracks.FirstOrDefault(t => t.Type == type);
        if (track == null)
        {
            track = new Track(name, type, Tracks.Count);
            Tracks.Add(track);
        }
        return track;
    }

    public Track? GetTrackById(string trackId) => Tracks.FirstOrDefault(t => t.Id == trackId);

    public Clip? FindClipById(string clipId)
    {
        foreach (var track in Tracks)
        {
            var clip = track.Clips.FirstOrDefault(c => c.Id == clipId);
            if (clip != null) return clip;
        }
        return null;
    }

    public Track? FindTrackForClip(string clipId)
    {
        return Tracks.FirstOrDefault(t => t.Clips.Any(c => c.Id == clipId));
    }

    public List<Clip> GetClipsAt(TimeSpan time)
    {
        var result = new List<Clip>();
        foreach (var track in Tracks.Where(t => !t.IsMuted).OrderBy(t => t.OrderIndex))
        {
            var activeClips = track.Clips.Where(c => time >= c.StartTime && time < c.EndTime);
            result.AddRange(activeClips);
        }
        return result;
    }

    public Timeline Clone()
    {
        return new Timeline
        {
            PlayheadPosition = PlayheadPosition,
            Tracks = Tracks.Select(t => t.Clone()).ToList()
        };
    }
}
