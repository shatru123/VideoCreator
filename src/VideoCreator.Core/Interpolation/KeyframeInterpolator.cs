using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Interpolation;

public static class KeyframeInterpolator
{
    public static double Ease(double t, InterpolationType type)
    {
        t = Math.Clamp(t, 0.0, 1.0);
        return type switch
        {
            InterpolationType.Linear => t,
            InterpolationType.EaseIn => t * t,
            InterpolationType.EaseOut => t * (2.0 - t),
            InterpolationType.EaseInOut => t < 0.5 ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t,
            _ => t
        };
    }

    public static double Interpolate(double startValue, double endValue, double t, InterpolationType type)
    {
        double factor = Ease(t, type);
        return startValue + (endValue - startValue) * factor;
    }

    public static float Interpolate(float startValue, float endValue, double t, InterpolationType type)
    {
        return (float)Interpolate((double)startValue, (double)endValue, t, type);
    }
}
