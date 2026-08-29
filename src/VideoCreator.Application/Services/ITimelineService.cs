using System;
using VideoCreator.Core.Commands;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.Application.Services;

public interface ITimelineService
{
    UndoRedoManager UndoRedo { get; }
    void AddClip(Track track, Clip clip);
    void DeleteClip(Clip clip);
    void MoveClip(Clip clip, TimeSpan newStartTime, Track? newTrack = null);
    void ResizeClip(Clip clip, TimeSpan newDuration);
    void SplitClip(Clip clip, TimeSpan splitTime);
    void SetClipTransition(Clip clip, TransitionType type, TimeSpan duration);
    void AddClipEffect(Clip clip, EffectType type, double intensity = 1.0);
    void RemoveClipEffect(Clip clip, EffectType type);
}
