using System;
using FluentAssertions;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Rendering.Motion;
using Xunit;

namespace VideoCreator.Tests.Rendering;

public class PhotoMotionTests
{
    [Fact]
    public void PhotoMotionEngine_ShouldProduceValidTransformationMatrices()
    {
        var transform = new Transform();
        var matrixStart = PhotoMotionEngine.ComputeMotionMatrix(
            MotionPreset.ZoomIn,
            TimeSpan.Zero,
            TimeSpan.FromSeconds(4.0),
            1080, 1920,
            1200, 800,
            transform);

        var matrixEnd = PhotoMotionEngine.ComputeMotionMatrix(
            MotionPreset.ZoomIn,
            TimeSpan.FromSeconds(4.0),
            TimeSpan.FromSeconds(4.0),
            1080, 1920,
            1200, 800,
            transform);

        matrixStart.ScaleX.Should().BeGreaterThan(0);
        matrixEnd.ScaleX.Should().BeGreaterThan(matrixStart.ScaleX); // Zoom In increases scale
    }
}
