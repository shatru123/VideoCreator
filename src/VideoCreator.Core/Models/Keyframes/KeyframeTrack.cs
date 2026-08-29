using System;
using System.Collections.Generic;
using System.Linq;
using VideoCreator.Core.Interpolation;

namespace VideoCreator.Core.Models.Keyframes;

public class KeyframeTrack
{
    public string PropertyName { get; set; } = string.Empty;
    public List<Keyframe> Keyframes { get; set; } = new();

    public KeyframeTrack() { }

    public KeyframeTrack(string propertyName)
    {
        PropertyName = propertyName;
    }

    public void AddOrUpdateKeyframe(TimeSpan time, double value, Enums.InterpolationType interpolation = Enums.InterpolationType.EaseInOut)
    {
        var existing = Keyframes.FirstOrDefault(k => k.Time == time);
        if (existing != null)
        {
            existing.Value = value;
            existing.Interpolation = interpolation;
        }
        else
        {
            Keyframes.Add(new Keyframe(time, value, interpolation));
            Keyframes.Sort((a, b) => a.Time.CompareTo(b.Time));
        }
    }

    public double Evaluate(TimeSpan time, double defaultValue = 0.0)
    {
        if (Keyframes.Count == 0)
            return defaultValue;

        if (time <= Keyframes[0].Time)
            return Keyframes[0].Value;

        if (time >= Keyframes[^1].Time)
            return Keyframes[^1].Value;

        for (int i = 0; i < Keyframes.Count - 1; i++)
        {
            var k1 = Keyframes[i];
            var k2 = Keyframes[i + 1];

            if (time >= k1.Time && time <= k2.Time)
            {
                double duration = (k2.Time - k1.Time).TotalSeconds;
                if (duration <= 0.0001)
                    return k1.Value;

                double t = (time - k1.Time).TotalSeconds / duration;
                return KeyframeInterpolator.Interpolate(k1.Value, k2.Value, t, k1.Interpolation);
            }
        }

        return defaultValue;
    }

    public KeyframeTrack Clone()
    {
        return new KeyframeTrack(PropertyName)
        {
            Keyframes = Keyframes.Select(k => k.Clone()).ToList()
        };
    }
}
