using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class ChangeTextCommand : ICommand
{
    private readonly TextClip _clip;
    private readonly TextOverlay _oldOverlay;
    private readonly TextOverlay _newOverlay;

    public string Description => $"Change Text on '{_clip.Name}'";

    public ChangeTextCommand(TextClip clip, TextOverlay newOverlay)
    {
        _clip = clip;
        _oldOverlay = clip.Overlay.Clone();
        _newOverlay = newOverlay.Clone();
    }

    public void Execute() => _clip.Overlay = _newOverlay.Clone();
    public void Undo() => _clip.Overlay = _oldOverlay.Clone();
}
