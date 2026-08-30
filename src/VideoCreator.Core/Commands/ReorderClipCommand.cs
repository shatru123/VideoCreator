using System;
using System.Collections.Generic;
using System.Linq;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class ReorderClipCommand : ICommand
{
    private readonly Track _track;
    private readonly List<Clip> _oldOrder;
    private readonly List<Clip> _newOrder;

    public string Description => "Reorder Clips";

    public ReorderClipCommand(Track track, List<Clip> newOrder)
    {
        _track = track;
        _oldOrder = new List<Clip>(track.Clips);
        _newOrder = new List<Clip>(newOrder);
    }

    public void Execute()
    {
        _track.Clips.Clear();
        TimeSpan currentStart = TimeSpan.Zero;
        foreach (var clip in _newOrder)
        {
            clip.StartTime = currentStart;
            currentStart += clip.Duration;
            _track.Clips.Add(clip);
        }
    }

    public void Undo()
    {
        _track.Clips.Clear();
        TimeSpan currentStart = TimeSpan.Zero;
        foreach (var clip in _oldOrder)
        {
            clip.StartTime = currentStart;
            currentStart += clip.Duration;
            _track.Clips.Add(clip);
        }
    }
}
