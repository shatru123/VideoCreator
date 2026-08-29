using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class DeleteClipCommand : ICommand
{
    private readonly Track _track;
    private readonly Clip _clip;
    private readonly int _originalIndex;

    public string Description => $"Delete Clip '{_clip.Name}'";

    public DeleteClipCommand(Track track, Clip clip)
    {
        _track = track;
        _clip = clip;
        _originalIndex = track.Clips.IndexOf(clip);
    }

    public void Execute()
    {
        _track.Clips.Remove(_clip);
    }

    public void Undo()
    {
        if (_originalIndex >= 0 && _originalIndex <= _track.Clips.Count)
            _track.Clips.Insert(_originalIndex, _clip);
        else
            _track.Clips.Add(_clip);
    }
}
