using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models.Clips;

public class ImageClip : Clip
{
    public string SourceFilePath { get; set; } = string.Empty;
    public MotionPreset Motion { get; set; } = MotionPreset.ZoomIn;
    public CropMode CropMode { get; set; } = CropMode.Fit;
    public double RotationDegrees { get; set; } = 0.0;
    public int Width { get; set; }
    public int Height { get; set; }

    public ImageClip()
    {
        Name = "Photo";
    }

    public ImageClip(string filePath, TimeSpan duration) : this()
    {
        SourceFilePath = filePath;
        Duration = duration;
        Name = System.IO.Path.GetFileNameWithoutExtension(filePath);
    }

    public override Clip Clone()
    {
        var clone = new ImageClip
        {
            SourceFilePath = SourceFilePath,
            Motion = Motion,
            CropMode = CropMode,
            RotationDegrees = RotationDegrees,
            Width = Width,
            Height = Height
        };
        CopyBasePropertiesTo(clone);
        return clone;
    }
}
