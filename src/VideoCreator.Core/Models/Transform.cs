using System;

namespace VideoCreator.Core.Models;

public class Transform
{
    public double PositionX { get; set; } = 0.0;
    public double PositionY { get; set; } = 0.0;
    public double ScaleX { get; set; } = 1.0;
    public double ScaleY { get; set; } = 1.0;
    public double RotationDegrees { get; set; } = 0.0;
    public double Opacity { get; set; } = 1.0;
    public double AnchorX { get; set; } = 0.5; // Normalized center anchor (0.0 - 1.0)
    public double AnchorY { get; set; } = 0.5;

    public Transform Clone() => new()
    {
        PositionX = PositionX,
        PositionY = PositionY,
        ScaleX = ScaleX,
        ScaleY = ScaleY,
        RotationDegrees = RotationDegrees,
        Opacity = Opacity,
        AnchorX = AnchorX,
        AnchorY = AnchorY
    };
}
