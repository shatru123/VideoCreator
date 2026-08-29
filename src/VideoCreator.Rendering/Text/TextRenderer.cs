using System;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Interpolation;
using VideoCreator.Core.Models;

namespace VideoCreator.Rendering.Text;

public static class TextRenderer
{
    public static void RenderTextOverlay(
        SKCanvas canvas,
        TextOverlay overlay,
        Transform transform,
        TimeSpan clipLocalTime,
        TimeSpan clipDuration,
        float canvasWidth,
        float canvasHeight)
    {
        if (string.IsNullOrEmpty(overlay.Text)) return;

        double localSec = clipLocalTime.TotalSeconds;
        double durationSec = Math.Max(0.1, clipDuration.TotalSeconds);
        double animDurSec = Math.Min(overlay.AnimationDuration.TotalSeconds, durationSec * 0.4);

        float animOpacity = 1.0f;
        float animOffsetY = 0.0f;
        float animScale = 1.0f;
        string displayText = overlay.Text;

        // Entry Animation
        if (localSec < animDurSec && animDurSec > 0)
        {
            double t = localSec / animDurSec;
            double ease = KeyframeInterpolator.Ease(t, InterpolationType.EaseOut);

            switch (overlay.EntryAnimation)
            {
                case TextAnimation.Fade:
                    animOpacity = (float)ease;
                    break;
                case TextAnimation.Slide:
                    animOffsetY = (float)((1.0 - ease) * 60.0);
                    animOpacity = (float)ease;
                    break;
                case TextAnimation.Pop:
                case TextAnimation.Zoom:
                    animScale = (float)(0.6 + 0.4 * ease);
                    animOpacity = (float)ease;
                    break;
                case TextAnimation.Typewriter:
                    int charCount = Math.Clamp((int)(overlay.Text.Length * ease), 1, overlay.Text.Length);
                    displayText = overlay.Text[..charCount];
                    break;
            }
        }
        // Exit Animation
        else if (localSec > (durationSec - animDurSec) && animDurSec > 0)
        {
            double t = (durationSec - localSec) / animDurSec;
            double ease = KeyframeInterpolator.Ease(t, InterpolationType.EaseIn);

            switch (overlay.ExitAnimation)
            {
                case TextAnimation.Fade:
                    animOpacity = (float)ease;
                    break;
                case TextAnimation.Slide:
                    animOffsetY = (float)((1.0 - ease) * -60.0);
                    animOpacity = (float)ease;
                    break;
                case TextAnimation.Pop:
                case TextAnimation.Zoom:
                    animScale = (float)(0.6 + 0.4 * ease);
                    animOpacity = (float)ease;
                    break;
            }
        }

        float totalOpacity = (float)(transform.Opacity * animOpacity);
        if (totalOpacity <= 0.01f) return;

        using var typeface = SKTypeface.FromFamilyName(overlay.FontFamily, (SKFontStyleWeight)overlay.FontWeight, SKFontStyleWidth.Normal, SKFontStyleSlant.Upright);

        SKColor textColor = SKColor.TryParse(overlay.ColorHex, out var parsedColor) ? parsedColor : SKColors.White;
        textColor = textColor.WithAlpha((byte)(textColor.Alpha * totalOpacity));

        using var textPaint = new SKPaint
        {
            Typeface = typeface ?? SKTypeface.Default,
            TextSize = (float)overlay.FontSize,
            Color = textColor,
            IsAntialias = true
        };

        var textBounds = new SKRect();
        textPaint.MeasureText(displayText, ref textBounds);

        float textWidth = textBounds.Width;
        float textHeight = (float)overlay.FontSize;

        // Position calculation
        float posX = canvasWidth * (float)transform.AnchorX + (float)transform.PositionX;
        float posY = canvasHeight * (float)transform.AnchorY + (float)transform.PositionY + animOffsetY;

        float textDrawX = overlay.Alignment switch
        {
            TextAlignment.Left => posX,
            TextAlignment.Right => posX - textWidth,
            TextAlignment.Center => posX - textWidth * 0.5f,
            _ => posX - textWidth * 0.5f
        };
        float textDrawY = posY;

        canvas.Save();

        // Scale & Rotation
        if (Math.Abs(animScale - 1.0f) > 0.01f || Math.Abs(transform.ScaleX - 1.0) > 0.01 || Math.Abs(transform.RotationDegrees) > 0.01)
        {
            float totalScaleX = (float)transform.ScaleX * animScale;
            float totalScaleY = (float)transform.ScaleY * animScale;
            canvas.Translate(posX, posY);
            canvas.Scale(totalScaleX, totalScaleY);
            if (Math.Abs(transform.RotationDegrees) > 0.01)
            {
                canvas.RotateDegrees((float)transform.RotationDegrees);
            }
            canvas.Translate(-posX, -posY);
        }

        // Draw Background Pill if configured
        if (!string.IsNullOrEmpty(overlay.BackgroundColorHex))
        {
            if (SKColor.TryParse(overlay.BackgroundColorHex, out var bgParsed))
            {
                var bgColor = bgParsed.WithAlpha((byte)(bgParsed.Alpha * totalOpacity));
                using var bgPaint = new SKPaint
                {
                    Color = bgColor,
                    IsAntialias = true,
                    Style = SKPaintStyle.Fill
                };

                float pad = (float)overlay.BackgroundPadding;
                float radius = (float)overlay.BackgroundCornerRadius;
                var bgRect = new SKRoundRect(
                    new SKRect(textDrawX - pad, textDrawY - textHeight - pad + 8, textDrawX + textWidth + pad, textDrawY + pad + 8),
                    radius, radius);
                canvas.DrawRoundRect(bgRect, bgPaint);
            }
        }

        // Draw Shadow
        if (overlay.ShadowBlur > 0 && !string.IsNullOrEmpty(overlay.ShadowColorHex))
        {
            if (SKColor.TryParse(overlay.ShadowColorHex, out var shadowColor))
            {
                using var shadowPaint = new SKPaint
                {
                    Typeface = typeface ?? SKTypeface.Default,
                    TextSize = (float)overlay.FontSize,
                    Color = shadowColor.WithAlpha((byte)(shadowColor.Alpha * totalOpacity)),
                    IsAntialias = true,
                    ImageFilter = SKImageFilter.CreateDropShadowOnly(
                        (float)overlay.ShadowOffsetX,
                        (float)overlay.ShadowOffsetY,
                        (float)overlay.ShadowBlur,
                        (float)overlay.ShadowBlur,
                        shadowColor.WithAlpha((byte)(shadowColor.Alpha * totalOpacity)))
                };
                canvas.DrawText(displayText, textDrawX, textDrawY, shadowPaint);
            }
        }

        // Draw Stroke
        if (overlay.StrokeWidth > 0 && !string.IsNullOrEmpty(overlay.StrokeColorHex))
        {
            if (SKColor.TryParse(overlay.StrokeColorHex, out var strokeColor))
            {
                using var strokePaint = new SKPaint
                {
                    Typeface = typeface ?? SKTypeface.Default,
                    TextSize = (float)overlay.FontSize,
                    Color = strokeColor.WithAlpha((byte)(strokeColor.Alpha * totalOpacity)),
                    IsAntialias = true,
                    Style = SKPaintStyle.Stroke,
                    StrokeWidth = (float)overlay.StrokeWidth
                };
                canvas.DrawText(displayText, textDrawX, textDrawY, strokePaint);
            }
        }

        // Draw Main Text
        canvas.DrawText(displayText, textDrawX, textDrawY, textPaint);

        canvas.Restore();
    }
}
