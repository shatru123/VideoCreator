using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Transitions;

namespace VideoCreator.Core.Commands;

public class ChangeTransitionCommand : ICommand
{
    private readonly Clip _clip;
    private readonly Transition? _oldTransition;
    private readonly Transition? _newTransition;
    private readonly bool _isTransitionOut;

    public string Description => $"Change Transition on '{_clip.Name}'";

    public ChangeTransitionCommand(Clip clip, Transition? newTransition, bool isTransitionOut = true)
    {
        _clip = clip;
        _newTransition = newTransition;
        _isTransitionOut = isTransitionOut;
        _oldTransition = isTransitionOut ? clip.TransitionOut?.Clone() : clip.TransitionIn?.Clone();
    }

    public void Execute()
    {
        if (_isTransitionOut) _clip.TransitionOut = _newTransition?.Clone();
        else _clip.TransitionIn = _newTransition?.Clone();
    }

    public void Undo()
    {
        if (_isTransitionOut) _clip.TransitionOut = _oldTransition?.Clone();
        else _clip.TransitionIn = _oldTransition?.Clone();
    }
}
