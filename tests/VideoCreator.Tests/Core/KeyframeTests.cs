using System;
using FluentAssertions;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Interpolation;
using VideoCreator.Core.Models.Keyframes;
using Xunit;

namespace VideoCreator.Tests.Core;

public class KeyframeTests
{
    [Theory]
    [InlineData(0.0, 0.0)]
    [InlineData(0.5, 0.5)]
    [InlineData(1.0, 1.0)]
    public void LinearInterpolation_ShouldBeProportional(double t, double expected)
    {
        double val = KeyframeInterpolator.Interpolate(0.0, 100.0, t, InterpolationType.Linear);
        val.Should().BeApproximately(expected * 100.0, 0.001);
    }

    [Fact]
    public void EaseInOut_ShouldSmoothlyAccelerateAndDecelerate()
    {
        double easeAt25 = KeyframeInterpolator.Ease(0.25, InterpolationType.EaseInOut);
        double easeAt75 = KeyframeInterpolator.Ease(0.75, InterpolationType.EaseInOut);

        easeAt25.Should().BeLessThan(0.25);
        easeAt75.Should().BeGreaterThan(0.75);
    }

    [Fact]
    public void KeyframeTrack_ShouldEvaluateValuesCorrectly()
    {
        var track = new KeyframeTrack("Scale");
        track.AddOrUpdateKeyframe(TimeSpan.Zero, 1.0, InterpolationType.Linear);
        track.AddOrUpdateKeyframe(TimeSpan.FromSeconds(4.0), 2.0, InterpolationType.Linear);

        track.Evaluate(TimeSpan.Zero).Should().Be(1.0);
        track.Evaluate(TimeSpan.FromSeconds(2.0)).Should().Be(1.5);
        track.Evaluate(TimeSpan.FromSeconds(4.0)).Should().Be(2.0);
        track.Evaluate(TimeSpan.FromSeconds(6.0)).Should().Be(2.0); // Clamped at end
    }
}
