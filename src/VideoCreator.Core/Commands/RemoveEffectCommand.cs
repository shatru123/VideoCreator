using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Effects;

namespace VideoCreator.Core.Commands;

public class RemoveEffectCommand : ICommand
{
    private readonly Clip _clip;
    private readonly Effect _effect;
    private readonly int _originalIndex;

    public string Description => $"Remove Effect '{_effect.Type}'";

    public RemoveEffectCommand(Clip clip, Effect effect)
    {
        _clip = clip;
        _effect = effect;
        _originalIndex = clip.Effects.IndexOf(effect);
    }

    public void Execute() => _clip.Effects.Remove(_effect);

    public void Undo()
    {
        if (_originalIndex >= 0 && _originalIndex <= _clip.Effects.Count)
            _clip.Effects.Insert(_originalIndex, _effect);
        else
            _clip.Effects.Add(_effect);
    }
}
