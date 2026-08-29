namespace VideoCreator.Core.Enums;

public enum AspectRatio
{
    Ratio16x9, // 1920x1080 (YouTube, Landscape)
    Ratio9x16, // 1080x1920 (Instagram Reels, TikTok, Shorts)
    Ratio1x1,  // 1080x1080 (Instagram Post, Square)
    Ratio4x5,  // 1080x1350 (Instagram Portrait)
    Ratio21x9, // 2560x1080 (Cinematic Ultrawide)
    Custom
}

public static class AspectRatioExtensions
{
    public static (int Width, int Height) GetDefaultDimensions(this AspectRatio ratio, int baseResolution = 1080)
    {
        return ratio switch
        {
            AspectRatio.Ratio16x9 => (1920, 1080),
            AspectRatio.Ratio9x16 => (1080, 1920),
            AspectRatio.Ratio1x1 => (1080, 1080),
            AspectRatio.Ratio4x5 => (1080, 1350),
            AspectRatio.Ratio21x9 => (2560, 1080),
            _ => (1920, 1080)
        };
    }

    public static double GetRatioValue(this AspectRatio ratio)
    {
        var (w, h) = ratio.GetDefaultDimensions();
        return (double)w / h;
    }

    public static string ToDisplayName(this AspectRatio ratio)
    {
        return ratio switch
        {
            AspectRatio.Ratio16x9 => "16:9 (YouTube / Landscape)",
            AspectRatio.Ratio9x16 => "9:16 (TikTok / Reels / Shorts)",
            AspectRatio.Ratio1x1 => "1:1 (Square Post)",
            AspectRatio.Ratio4x5 => "4:5 (Portrait Post)",
            AspectRatio.Ratio21x9 => "21:9 (Ultrawide Cinema)",
            _ => "Custom"
        };
    }
}
