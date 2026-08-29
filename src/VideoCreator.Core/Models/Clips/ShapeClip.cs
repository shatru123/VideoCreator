using System;

namespace VideoCreator.Core.Models.Clips;

public enum ShapeType
{
    Rectangle,
    RoundedRectangle,
    Circle,
    Pill
}

public class ShapeClip : Clip
{
    public ShapeType Shape { get; set; } = ShapeType.Rectangle;
    public string FillColorHex { get; set; } = "#FFFFFF";
    public string StrokeColorHex { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 0.0;
    public double CornerRadius { get; set; } = 8.0;
    public double Width { get; set; } = 200;
    public double Height { get; set; } = 100;

    public ShapeClip()
    {
        Name = "Shape";
    }

    public override Clip Clone()
    {
        var clone = new ShapeClip
        {
            Shape = Shape,
            FillColorHex = FillColorHex,
            StrokeColorHex = StrokeColorHex,
            StrokeWidth = StrokeWidth,
            CornerRadius = CornerRadius,
            Width = Width,
            Height = Height
        };
        CopyBasePropertiesTo(clone);
        return clone;
    }
}
