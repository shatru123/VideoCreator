using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class ChangeTransformCommand : ICommand
{
    private readonly Clip _clip;
    private readonly Transform _oldTransform;
    private readonly Transform _newTransform;

    public string Description => $"Change Transform on '{_clip.Name}'";

    public ChangeTransformCommand(Clip clip, Transform newTransform)
    {
        _clip = clip;
        _oldTransform = clip.Transform.Clone();
        _newTransform = newTransform.Clone();
    }

    public void Execute() => _clip.Transform = _newTransform.Clone();
    public void Undo() => _clip.Transform = _oldTransform.Clone();
}
