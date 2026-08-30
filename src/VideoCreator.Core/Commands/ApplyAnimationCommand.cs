using System.Collections.Generic;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Core.Commands;

public class ApplyAnimationCommand : ICommand
{
    private readonly List<(ImageClip Clip, MotionPreset OldPreset, MotionPreset NewPreset)> _changes;

    public string Description => "Change Animation";

    public ApplyAnimationCommand(IEnumerable<(ImageClip Clip, MotionPreset NewPreset)> changes)
    {
        _changes = new List<(ImageClip Clip, MotionPreset OldPreset, MotionPreset NewPreset)>();
        foreach (var (clip, newPreset) in changes)
        {
            _changes.Add((clip, clip.Motion, newPreset));
        }
    }

    public ApplyAnimationCommand(ImageClip clip, MotionPreset newPreset)
    {
        _changes = new List<(ImageClip, MotionPreset, MotionPreset)>
        {
            (clip, clip.Motion, newPreset)
        };
    }

    public void Execute()
    {
        foreach (var (clip, _, newPreset) in _changes)
        {
            clip.Motion = newPreset;
        }
    }

    public void Undo()
    {
        foreach (var (clip, oldPreset, _) in _changes)
        {
            clip.Motion = oldPreset;
        }
    }
}
