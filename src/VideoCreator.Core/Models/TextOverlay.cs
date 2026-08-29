using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models;

public class TextOverlay
{
    public string Text { get; set; } = string.Empty;
    public string FontFamily { get; set; } = "Arial";
    public double FontSize { get; set; } = 48.0;
    public int FontWeight { get; set; } = 700; // Bold default
    public string ColorHex { get; set; } = "#FFFFFF";
    public string StrokeColorHex { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 2.0;
    public string ShadowColorHex { get; set; } = "#80000000";
    public double ShadowBlur { get; set; } = 8.0;
    public double ShadowOffsetX { get; set; } = 2.0;
    public double ShadowOffsetY { get; set; } = 2.0;
    public string? BackgroundColorHex { get; set; } = null;
    public double BackgroundPadding { get; set; } = 12.0;
    public double BackgroundCornerRadius { get; set; } = 8.0;
    public TextAlignment Alignment { get; set; } = TextAlignment.Center;
    public TextAnimation EntryAnimation { get; set; } = TextAnimation.Fade;
    public TextAnimation ExitAnimation { get; set; } = TextAnimation.Fade;
    public TimeSpan AnimationDuration { get; set; } = TimeSpan.FromSeconds(0.5);

    public TextOverlay Clone() => new()
    {
        Text = Text,
        FontFamily = FontFamily,
        FontSize = FontSize,
        FontWeight = FontWeight,
        ColorHex = ColorHex,
        StrokeColorHex = StrokeColorHex,
        StrokeWidth = StrokeWidth,
        ShadowColorHex = ShadowColorHex,
        ShadowBlur = ShadowBlur,
        ShadowOffsetX = ShadowOffsetX,
        ShadowOffsetY = ShadowOffsetY,
        BackgroundColorHex = BackgroundColorHex,
        BackgroundPadding = BackgroundPadding,
        BackgroundCornerRadius = BackgroundCornerRadius,
        Alignment = Alignment,
        EntryAnimation = EntryAnimation,
        ExitAnimation = ExitAnimation,
        AnimationDuration = AnimationDuration
    };
}
