using System;

namespace VideoCreator.Core.Models;

public class Transform
{
    public double PositionX { get; set; } = 0.0;
    public double PositionY { get; set; } = 0.0;
    public double ScaleX { get; set; } = 1.0;
    public double ScaleY { get; set; } = 1.0;
    public double RotationDegrees { get; set; } = 0.0;
    public bool FlipX { get; set; } = false;
    public bool FlipY { get; set; } = false;
    public double Opacity { get; set; } = 1.0;
    public double AnchorX { get; set; } = 0.5; // Normalized center anchor (0.0 - 1.0)
    public double AnchorY { get; set; } = 0.5;

    public void Rotate90(bool clockwise = true)
    {
        RotationDegrees = (RotationDegrees + (clockwise ? 90.0 : -90.0)) % 360.0;
        if (RotationDegrees < -180.0) RotationDegrees += 360.0;
        if (RotationDegrees > 180.0) RotationDegrees -= 360.0;
    }

    public void ToggleFlipX() => FlipX = !FlipX;
    public void ToggleFlipY() => FlipY = !FlipY;

    public Transform Clone() => new()
    {
        PositionX = PositionX,
        PositionY = PositionY,
        ScaleX = ScaleX,
        ScaleY = ScaleY,
        RotationDegrees = RotationDegrees,
        FlipX = FlipX,
        FlipY = FlipY,
        Opacity = Opacity,
        AnchorX = AnchorX,
        AnchorY = AnchorY
    };
}
