using System;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class ResizeClipCommand : ICommand
{
    private readonly Clip _clip;
    private readonly TimeSpan _oldDuration;
    private readonly TimeSpan _newDuration;

    public string Description => $"Resize Clip '{_clip.Name}'";

    public ResizeClipCommand(Clip clip, TimeSpan newDuration)
    {
        _clip = clip;
        _oldDuration = clip.Duration;
        _newDuration = newDuration;
    }

    public void Execute()
    {
        _clip.Duration = _newDuration;
    }

    public void Undo()
    {
        _clip.Duration = _oldDuration;
    }
}
