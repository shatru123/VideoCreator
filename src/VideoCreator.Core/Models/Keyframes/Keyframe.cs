using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models.Keyframes;

public class Keyframe
{
    public TimeSpan Time { get; set; } = TimeSpan.Zero;
    public double Value { get; set; }
    public InterpolationType Interpolation { get; set; } = InterpolationType.EaseInOut;

    public Keyframe() { }

    public Keyframe(TimeSpan time, double value, InterpolationType interpolation = InterpolationType.EaseInOut)
    {
        Time = time;
        Value = value;
        Interpolation = interpolation;
    }

    public Keyframe Clone() => new(Time, Value, Interpolation);
}
