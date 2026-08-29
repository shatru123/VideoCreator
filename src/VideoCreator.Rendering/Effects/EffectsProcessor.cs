using System;
using System.Collections.Generic;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Effects;

namespace VideoCreator.Rendering.Effects;

public static class EffectsProcessor
{
    public static SKPaint CreateEffectsPaint(IEnumerable<Effect> effects, float canvasWidth, float canvasHeight)
    {
        var paint = new SKPaint
        {
            FilterQuality = SKFilterQuality.High,
            IsAntialias = true
        };

        SKColorFilter? combinedColorFilter = null;
        SKImageFilter? combinedImageFilter = null;

        foreach (var effect in effects)
        {
            if (!effect.IsEnabled || effect.Intensity <= 0.001)
                continue;

            float intensity = (float)Math.Clamp(effect.Intensity, 0.0, 2.0);

            switch (effect.Type)
            {
                case EffectType.Brightness:
                    float b = (intensity - 0.5f) * 100.0f;
                    var brightnessMatrix = new float[]
                    {
                        1, 0, 0, 0, b,
                        0, 1, 0, 0, b,
                        0, 0, 1, 0, b,
                        0, 0, 0, 1, 0
                    };
                    var bf = SKColorFilter.CreateColorMatrix(brightnessMatrix);
                    combinedColorFilter = combinedColorFilter != null ? SKColorFilter.CreateCompose(combinedColorFilter, bf) : bf;
                    break;

                case EffectType.Contrast:
                    float c = intensity * 1.5f;
                    float cOffset = 128f * (1f - c);
                    var contrastMatrix = new float[]
                    {
                        c, 0, 0, 0, cOffset,
                        0, c, 0, 0, cOffset,
                        0, 0, c, 0, cOffset,
                        0, 0, 0, 1, 0
                    };
                    var cf = SKColorFilter.CreateColorMatrix(contrastMatrix);
                    combinedColorFilter = combinedColorFilter != null ? SKColorFilter.CreateCompose(combinedColorFilter, cf) : cf;
                    break;

                case EffectType.Grayscale:
                    var grayMatrix = new float[]
                    {
                        0.2126f * intensity + (1 - intensity), 0.7152f * intensity, 0.0722f * intensity, 0, 0,
                        0.2126f * intensity, 0.7152f * intensity + (1 - intensity), 0.0722f * intensity, 0, 0,
                        0.2126f * intensity, 0.7152f * intensity, 0.0722f * intensity + (1 - intensity), 0, 0,
                        0, 0, 0, 1, 0
                    };
                    var gf = SKColorFilter.CreateColorMatrix(grayMatrix);
                    combinedColorFilter = combinedColorFilter != null ? SKColorFilter.CreateCompose(combinedColorFilter, gf) : gf;
                    break;

                case EffectType.Vintage:
                    var sepiaMatrix = new float[]
                    {
                        0.393f * intensity + (1 - intensity), 0.769f * intensity, 0.189f * intensity, 0, 0,
                        0.349f * intensity, 0.686f * intensity + (1 - intensity), 0.168f * intensity, 0, 0,
                        0.272f * intensity, 0.534f * intensity, 0.131f * intensity + (1 - intensity), 0, 0,
                        0, 0, 0, 1, 0
                    };
                    var sf = SKColorFilter.CreateColorMatrix(sepiaMatrix);
                    combinedColorFilter = combinedColorFilter != null ? SKColorFilter.CreateCompose(combinedColorFilter, sf) : sf;
                    break;

                case EffectType.Cinematic:
                    // Teal & orange cinematic tone curve matrix
                    var cineMatrix = new float[]
                    {
                        1.15f * intensity + (1 - intensity), 0, 0, 0, 10 * intensity,
                        0, 1.0f, 0, 0, 0,
                        0, 0, 0.85f * intensity + (1 - intensity), 0, 15 * intensity,
                        0, 0, 0, 1, 0
                    };
                    var cinf = SKColorFilter.CreateColorMatrix(cineMatrix);
                    combinedColorFilter = combinedColorFilter != null ? SKColorFilter.CreateCompose(combinedColorFilter, cinf) : cinf;
                    break;

                case EffectType.Blur:
                    float blurSigma = intensity * 15.0f;
                    combinedImageFilter = SKImageFilter.CreateBlur(blurSigma, blurSigma);
                    break;
            }
        }

        paint.ColorFilter = combinedColorFilter;
        paint.ImageFilter = combinedImageFilter;

        return paint;
    }

    public static void DrawVignetteOverlay(SKCanvas canvas, float width, float height, float intensity = 0.5f)
    {
        if (intensity <= 0.01f) return;

        using var paint = new SKPaint
        {
            Shader = SKShader.CreateRadialGradient(
                new SKPoint(width * 0.5f, height * 0.5f),
                Math.Max(width, height) * 0.75f,
                new[] { SKColors.Transparent, new SKColor(0, 0, 0, (byte)(intensity * 200)) },
                new[] { 0.4f, 1.0f },
                SKShaderTileMode.Clamp),
            BlendMode = SKBlendMode.SrcOver
        };

        canvas.DrawRect(new SKRect(0, 0, width, height), paint);
    }
}
