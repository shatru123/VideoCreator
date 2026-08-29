using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models;

public class CanvasSettings
{
    public int Width { get; set; } = 1920;
    public int Height { get; set; } = 1080;
    public int Fps { get; set; } = 30;
    public AspectRatio AspectRatio { get; set; } = AspectRatio.Ratio16x9;
    public string BackgroundColorHex { get; set; } = "#000000";

    public CanvasSettings() { }

    public CanvasSettings(AspectRatio ratio, int fps = 30)
    {
        AspectRatio = ratio;
        Fps = fps;
        var (w, h) = ratio.GetDefaultDimensions();
        Width = w;
        Height = h;
    }

    public void ApplyAspectRatio(AspectRatio ratio)
    {
        AspectRatio = ratio;
        var (w, h) = ratio.GetDefaultDimensions();
        Width = w;
        Height = h;
    }

    public CanvasSettings Clone() => new()
    {
        Width = Width,
        Height = Height,
        Fps = Fps,
        AspectRatio = AspectRatio,
        BackgroundColorHex = BackgroundColorHex
    };
}
