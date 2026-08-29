using System;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class SplitClipCommand : ICommand
{
    private readonly Track _track;
    private readonly Clip _originalClip;
    private readonly TimeSpan _splitOffset;
    private readonly TimeSpan _originalDuration;
    private Clip? _secondHalf;

    public string Description => $"Split Clip '{_originalClip.Name}'";

    public SplitClipCommand(Track track, Clip clip, TimeSpan splitTime)
    {
        _track = track;
        _originalClip = clip;
        _originalDuration = clip.Duration;
        _splitOffset = splitTime - clip.StartTime;
    }

    public void Execute()
    {
        if (_splitOffset <= TimeSpan.Zero || _splitOffset >= _originalDuration)
            return;

        _originalClip.Duration = _splitOffset;

        _secondHalf = _originalClip.Clone();
        _secondHalf.StartTime = _originalClip.StartTime + _splitOffset;
        _secondHalf.Duration = _originalDuration - _splitOffset;
        _secondHalf.SourceStartTime = _originalClip.SourceStartTime + _splitOffset;

        int originalIndex = _track.Clips.IndexOf(_originalClip);
        if (originalIndex >= 0)
            _track.Clips.Insert(originalIndex + 1, _secondHalf);
        else
            _track.Clips.Add(_secondHalf);
    }

    public void Undo()
    {
        _originalClip.Duration = _originalDuration;
        if (_secondHalf != null)
        {
            _track.Clips.Remove(_secondHalf);
        }
    }
}
