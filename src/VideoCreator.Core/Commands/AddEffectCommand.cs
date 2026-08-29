using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Effects;

namespace VideoCreator.Core.Commands;

public class AddEffectCommand : ICommand
{
    private readonly Clip _clip;
    private readonly Effect _effect;

    public string Description => $"Add Effect '{_effect.Type}'";

    public AddEffectCommand(Clip clip, Effect effect)
    {
        _clip = clip;
        _effect = effect;
    }

    public void Execute() => _clip.Effects.Add(_effect);
    public void Undo() => _clip.Effects.Remove(_effect);
}
