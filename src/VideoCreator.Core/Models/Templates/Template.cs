using System;
using System.Collections.Generic;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Effects;

namespace VideoCreator.Core.Models.Templates;

public enum TemplateCategory
{
    Cinematic,
    Memories,
    Celebration,
    Wedding,
    Travel,
    Family,
    Romantic,
    Minimal,
    Festival,
    Social
}

public class Template
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public TemplateCategory Category { get; set; } = TemplateCategory.Cinematic;
    public AspectRatio RecommendedAspectRatio { get; set; } = AspectRatio.Ratio9x16;
    public double DefaultPhotoDurationSeconds { get; set; } = 3.5;
    public MotionPreset DefaultMotion { get; set; } = MotionPreset.Cinematic;
    public TransitionType DefaultTransition { get; set; } = TransitionType.CrossDissolve;
    public double TransitionDurationSeconds { get; set; } = 0.75;
    public CropMode CropMode { get; set; } = CropMode.BlurBackground;
    public List<Effect> DefaultEffects { get; set; } = new();
    public string SuggestedTitle { get; set; } = "My Story";
    public string AccentColorHex { get; set; } = "#3B82F6";
    public bool SyncWithBeats { get; set; } = true;
    public List<string> Tags { get; set; } = new();

    public static List<Template> GetBuiltInTemplates()
    {
        return new List<Template>
        {
            new()
            {
                Id = "template-cinematic",
                Name = "Cinematic Story",
                Description = "Slow majestic zooms and cross-dissolves with subtle cinematic warmth.",
                Category = TemplateCategory.Cinematic,
                RecommendedAspectRatio = AspectRatio.Ratio16x9,
                DefaultPhotoDurationSeconds = 4.0,
                DefaultMotion = MotionPreset.Cinematic,
                DefaultTransition = TransitionType.CrossDissolve,
                TransitionDurationSeconds = 1.0,
                CropMode = CropMode.BlurBackground,
                DefaultEffects = new List<Effect> { new(EffectType.Cinematic, 0.8), new(EffectType.Vignette, 0.4) },
                SuggestedTitle = "A Cinematic Journey",
                AccentColorHex = "#F59E0B",
                SyncWithBeats = true,
                Tags = new() { "cinema", "widescreen", "dramatic", "warm" }
            },
            new()
            {
                Id = "template-memories",
                Name = "Golden Memories",
                Description = "Warm vintage tones, soft fade transitions, and gentle pan motions.",
                Category = TemplateCategory.Memories,
                RecommendedAspectRatio = AspectRatio.Ratio9x16,
                DefaultPhotoDurationSeconds = 3.5,
                DefaultMotion = MotionPreset.ZoomIn,
                DefaultTransition = TransitionType.Fade,
                TransitionDurationSeconds = 0.8,
                CropMode = CropMode.BlurBackground,
                DefaultEffects = new List<Effect> { new(EffectType.Vintage, 0.7), new(EffectType.Temperature, 0.3) },
                SuggestedTitle = "Unforgettable Moments",
                AccentColorHex = "#EC4899",
                SyncWithBeats = false,
                Tags = new() { "nostalgia", "memories", "vintage", "family" }
            },
            new()
            {
                Id = "template-birthday",
                Name = "Birthday Celebration",
                Description = "Dynamic slide and pop transitions with energetic motion and vibrant colors.",
                Category = TemplateCategory.Celebration,
                RecommendedAspectRatio = AspectRatio.Ratio9x16,
                DefaultPhotoDurationSeconds = 2.5,
                DefaultMotion = MotionPreset.ZoomOut,
                DefaultTransition = TransitionType.SlideLeft,
                TransitionDurationSeconds = 0.5,
                CropMode = CropMode.BlurBackground,
                DefaultEffects = new List<Effect> { new(EffectType.Saturation, 0.3), new(EffectType.Brightness, 0.1) },
                SuggestedTitle = "Happy Birthday!",
                AccentColorHex = "#8B5CF6",
                SyncWithBeats = true,
                Tags = new() { "birthday", "party", "fun", "celebrate" }
            },
            new()
            {
                Id = "template-wedding",
                Name = "Wedding & Romance",
                Description = "Dreamy glow, slow dissolves, and elegant typography for romantic journeys.",
                Category = TemplateCategory.Wedding,
                RecommendedAspectRatio = AspectRatio.Ratio16x9,
                DefaultPhotoDurationSeconds = 4.5,
                DefaultMotion = MotionPreset.ZoomIn,
                DefaultTransition = TransitionType.CrossDissolve,
                TransitionDurationSeconds = 1.2,
                CropMode = CropMode.BlurBackground,
                DefaultEffects = new List<Effect> { new(EffectType.Glow, 0.5), new(EffectType.Exposure, 0.1) },
                SuggestedTitle = "Forever & Always",
                AccentColorHex = "#F43F5E",
                SyncWithBeats = false,
                Tags = new() { "wedding", "love", "couple", "elegant" }
            },
            new()
            {
                Id = "template-travel",
                Name = "Travel & Adventure",
                Description = "Fast-paced directional slides, bold punchy colors, and diagonal pans.",
                Category = TemplateCategory.Travel,
                RecommendedAspectRatio = AspectRatio.Ratio9x16,
                DefaultPhotoDurationSeconds = 2.8,
                DefaultMotion = MotionPreset.DiagonalDownRight,
                DefaultTransition = TransitionType.Push,
                TransitionDurationSeconds = 0.6,
                CropMode = CropMode.Fill,
                DefaultEffects = new List<Effect> { new(EffectType.Contrast, 0.2), new(EffectType.Saturation, 0.25) },
                SuggestedTitle = "Wanderlust Chronicles",
                AccentColorHex = "#10B981",
                SyncWithBeats = true,
                Tags = new() { "travel", "vlog", "explore", "nature" }
            },
            new()
            {
                Id = "template-instagram-reel",
                Name = "Instagram Reel / TikTok",
                Description = "Fast beat-synchronized cuts, vertical 9:16 framing, and modern wipe transitions.",
                Category = TemplateCategory.Social,
                RecommendedAspectRatio = AspectRatio.Ratio9x16,
                DefaultPhotoDurationSeconds = 2.0,
                DefaultMotion = MotionPreset.Random,
                DefaultTransition = TransitionType.Wipe,
                TransitionDurationSeconds = 0.4,
                CropMode = CropMode.BlurBackground,
                DefaultEffects = new List<Effect> { new(EffectType.Contrast, 0.15), new(EffectType.Sharpen, 0.2) },
                SuggestedTitle = "Trending Highlights",
                AccentColorHex = "#06B6D4",
                SyncWithBeats = true,
                Tags = new() { "reels", "tiktok", "vertical", "viral" }
            },
            new()
            {
                Id = "template-minimal",
                Name = "Clean & Minimal",
                Description = "Crisp, clean cuts with pure aesthetic balance and high contrast clarity.",
                Category = TemplateCategory.Minimal,
                RecommendedAspectRatio = AspectRatio.Ratio1x1,
                DefaultPhotoDurationSeconds = 3.0,
                DefaultMotion = MotionPreset.None,
                DefaultTransition = TransitionType.Fade,
                TransitionDurationSeconds = 0.5,
                CropMode = CropMode.Fit,
                DefaultEffects = new List<Effect>(),
                SuggestedTitle = "A Simpler View",
                AccentColorHex = "#64748B",
                SyncWithBeats = false,
                Tags = new() { "minimal", "clean", "modern", "grid" }
            },
            new()
            {
                Id = "template-festival",
                Name = "Festival of Lights / Utsav",
                Description = "Warm festive brilliance with glowing highlights and rhythmic transitions.",
                Category = TemplateCategory.Festival,
                RecommendedAspectRatio = AspectRatio.Ratio9x16,
                DefaultPhotoDurationSeconds = 3.0,
                DefaultMotion = MotionPreset.ZoomIn,
                DefaultTransition = TransitionType.CrossDissolve,
                TransitionDurationSeconds = 0.7,
                CropMode = CropMode.BlurBackground,
                DefaultEffects = new List<Effect> { new(EffectType.Glow, 0.6), new(EffectType.Saturation, 0.3) },
                SuggestedTitle = "Festive Blessings",
                AccentColorHex = "#EAB308",
                SyncWithBeats = true,
                Tags = new() { "festival", "diwali", "celebration", "tradition" }
            }
        };
    }
}
