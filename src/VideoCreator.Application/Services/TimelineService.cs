using System;
using System.Linq;
using VideoCreator.Core.Commands;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Effects;
using VideoCreator.Core.Models.Transitions;

namespace VideoCreator.Application.Services;

public class TimelineService : ITimelineService
{
    private readonly IProjectService _projectService;
    public UndoRedoManager UndoRedo { get; } = new();

    public TimelineService(IProjectService projectService)
    {
        _projectService = projectService;
    }

    public void AddClip(Track track, Clip clip)
    {
        var cmd = new AddClipCommand(track, clip);
        UndoRedo.Execute(cmd);
        _projectService.IsDirty = true;
    }

    public void DeleteClip(Clip clip)
    {
        var track = _projectService.CurrentProject.Timeline.FindTrackForClip(clip.Id);
        if (track != null)
        {
            var cmd = new DeleteClipCommand(track, clip);
            UndoRedo.Execute(cmd);
            _projectService.IsDirty = true;
        }
    }

    public void MoveClip(Clip clip, TimeSpan newStartTime, Track? newTrack = null)
    {
        var currentTrack = _projectService.CurrentProject.Timeline.FindTrackForClip(clip.Id);
        var cmd = new MoveClipCommand(clip, newStartTime, newTrack, currentTrack);
        UndoRedo.Execute(cmd);
        _projectService.IsDirty = true;
    }

    public void ResizeClip(Clip clip, TimeSpan newDuration)
    {
        if (newDuration <= TimeSpan.FromMilliseconds(200)) return;
        var cmd = new ResizeClipCommand(clip, newDuration);
        UndoRedo.Execute(cmd);
        _projectService.IsDirty = true;
    }

    public void SplitClip(Clip clip, TimeSpan splitTime)
    {
        var track = _projectService.CurrentProject.Timeline.FindTrackForClip(clip.Id);
        if (track != null && splitTime > clip.StartTime && splitTime < clip.EndTime)
        {
            var cmd = new SplitClipCommand(track, clip, splitTime);
            UndoRedo.Execute(cmd);
            _projectService.IsDirty = true;
        }
    }

    public void SetClipTransition(Clip clip, TransitionType type, TimeSpan duration)
    {
        var transition = type == TransitionType.None ? null : new Transition(type, duration);
        var cmd = new ChangeTransitionCommand(clip, transition, isTransitionOut: true);
        UndoRedo.Execute(cmd);
        _projectService.IsDirty = true;
    }

    public void AddClipEffect(Clip clip, EffectType type, double intensity = 1.0)
    {
        var existing = clip.Effects.FirstOrDefault(e => e.Type == type);
        if (existing != null)
        {
            existing.Intensity = intensity;
        }
        else
        {
            var effect = new Effect(type, intensity);
            var cmd = new AddEffectCommand(clip, effect);
            UndoRedo.Execute(cmd);
        }
        _projectService.IsDirty = true;
    }

    public void RemoveClipEffect(Clip clip, EffectType type)
    {
        var effect = clip.Effects.FirstOrDefault(e => e.Type == type);
        if (effect != null)
        {
            var cmd = new RemoveEffectCommand(clip, effect);
            UndoRedo.Execute(cmd);
            _projectService.IsDirty = true;
        }
    }
}
