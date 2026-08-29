using System;
using System.Collections.Generic;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models.Transitions;

public class Transition
{
    public TransitionType Type { get; set; } = TransitionType.None;
    public TimeSpan Duration { get; set; } = TimeSpan.FromSeconds(0.75);
    public InterpolationType Easing { get; set; } = InterpolationType.EaseInOut;
    public Dictionary<string, double> Parameters { get; set; } = new();

    public Transition() { }

    public Transition(TransitionType type, TimeSpan duration)
    {
        Type = type;
        Duration = duration;
    }

    public Transition Clone() => new()
    {
        Type = Type,
        Duration = Duration,
        Easing = Easing,
        Parameters = new Dictionary<string, double>(Parameters)
    };
}
