using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class AddClipCommand : ICommand
{
    private readonly Track _track;
    private readonly Clip _clip;
    private readonly int _index;

    public string Description => $"Add Clip '{_clip.Name}'";

    public AddClipCommand(Track track, Clip clip, int? index = null)
    {
        _track = track;
        _clip = clip;
        _clip.TrackId = track.Id;
        _index = index ?? track.Clips.Count;
    }

    public void Execute()
    {
        if (_index >= 0 && _index <= _track.Clips.Count)
            _track.Clips.Insert(_index, _clip);
        else
            _track.Clips.Add(_clip);
    }

    public void Undo()
    {
        _track.Clips.Remove(_clip);
    }
}
