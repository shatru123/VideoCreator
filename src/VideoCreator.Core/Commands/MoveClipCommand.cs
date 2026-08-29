using System;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class MoveClipCommand : ICommand
{
    private readonly Clip _clip;
    private readonly TimeSpan _oldStartTime;
    private readonly TimeSpan _newStartTime;
    private readonly Track? _oldTrack;
    private readonly Track? _newTrack;

    public string Description => $"Move Clip '{_clip.Name}'";

    public MoveClipCommand(Clip clip, TimeSpan newStartTime, Track? newTrack = null, Track? oldTrack = null)
    {
        _clip = clip;
        _oldStartTime = clip.StartTime;
        _newStartTime = newStartTime;
        _oldTrack = oldTrack;
        _newTrack = newTrack;
    }

    public void Execute()
    {
        _clip.StartTime = _newStartTime;
        if (_newTrack != null && _oldTrack != null && _newTrack != _oldTrack)
        {
            _oldTrack.Clips.Remove(_clip);
            _clip.TrackId = _newTrack.Id;
            _newTrack.Clips.Add(_clip);
        }
    }

    public void Undo()
    {
        _clip.StartTime = _oldStartTime;
        if (_newTrack != null && _oldTrack != null && _newTrack != _oldTrack)
        {
            _newTrack.Clips.Remove(_clip);
            _clip.TrackId = _oldTrack.Id;
            _oldTrack.Clips.Add(_clip);
        }
    }
}
