using System;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Media.Services;

namespace VideoCreator.Media.ImageProcessing;

public class SmartCropService : ISmartCropService
{
    public SKBitmap ApplyCropAndBackground(SKBitmap sourceBitmap, int targetWidth, int targetHeight, CropMode mode, string? backgroundColorHex = "#000000")
    {
        if (sourceBitmap == null) throw new ArgumentNullException(nameof(sourceBitmap));

        var targetBitmap = new SKBitmap(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var canvas = new SKCanvas(targetBitmap);

        SKColor bgColor = SKColor.TryParse(backgroundColorHex, out var parsed) ? parsed : SKColors.Black;
        canvas.Clear(bgColor);

        float srcW = sourceBitmap.Width;
        float srcH = sourceBitmap.Height;
        float dstW = targetWidth;
        float dstH = targetHeight;

        float srcRatio = srcW / srcH;
        float dstRatio = dstW / dstH;

        switch (mode)
        {
            case CropMode.BlurBackground:
                // 1. Draw blurred stretched/filled background
                using (var bgPaint = new SKPaint
                {
                    ImageFilter = SKImageFilter.CreateBlur(25.0f, 25.0f),
                    FilterQuality = SKFilterQuality.Medium
                })
                {
                    float bgScale = Math.Max(dstW / srcW, dstH / srcH);
                    float bgScaledW = srcW * bgScale;
                    float bgScaledH = srcH * bgScale;
                    float bgX = (dstW - bgScaledW) / 2.0f;
                    float bgY = (dstH - bgScaledH) / 2.0f;

                    var bgRect = new SKRect(bgX - 20, bgY - 20, bgX + bgScaledW + 20, bgY + bgScaledH + 20);
                    canvas.DrawBitmap(sourceBitmap, bgRect, bgPaint);

                    // Add subtle dark overlay on blur background for contrast
                    using var darkOverlay = new SKPaint { Color = new SKColor(0, 0, 0, 80) };
                    canvas.DrawRect(new SKRect(0, 0, dstW, dstH), darkOverlay);
                }

                // 2. Draw sharp foreground image centered with Fit aspect
                float fitScale = Math.Min(dstW / srcW, dstH / srcH);
                float fitW = srcW * fitScale;
                float fitH = srcH * fitScale;
                float fitX = (dstW - fitW) / 2.0f;
                float fitY = (dstH - fitH) / 2.0f;
                var fitRect = new SKRect(fitX, fitY, fitX + fitW, fitY + fitH);

                // Subtle drop shadow behind foreground image
                using (var shadowPaint = new SKPaint
                {
                    Color = new SKColor(0, 0, 0, 120),
                    ImageFilter = SKImageFilter.CreateDropShadow(0, 4, 12, 12, new SKColor(0, 0, 0, 160))
                })
                {
                    canvas.DrawRect(fitRect, shadowPaint);
                }

                using (var fgPaint = new SKPaint { FilterQuality = SKFilterQuality.High })
                {
                    canvas.DrawBitmap(sourceBitmap, fitRect, fgPaint);
                }
                break;

            case CropMode.Fill:
            case CropMode.CenterCrop:
            case CropMode.SmartCrop:
                // Scale to fill and crop edges
                float fillScale = Math.Max(dstW / srcW, dstH / srcH);
                float fillW = srcW * fillScale;
                float fillH = srcH * fillScale;
                float fillX = (dstW - fillW) / 2.0f;
                float fillY = (dstH - fillH) / 2.0f;

                using (var fillPaint = new SKPaint { FilterQuality = SKFilterQuality.High })
                {
                    canvas.DrawBitmap(sourceBitmap, new SKRect(fillX, fillY, fillX + fillW, fillY + fillH), fillPaint);
                }
                break;

            case CropMode.Fit:
            default:
                float scale = Math.Min(dstW / srcW, dstH / srcH);
                float scaledW = srcW * scale;
                float scaledH = srcH * scale;
                float posX = (dstW - scaledW) / 2.0f;
                float posY = (dstH - scaledH) / 2.0f;

                using (var paint = new SKPaint { FilterQuality = SKFilterQuality.High })
                {
                    canvas.DrawBitmap(sourceBitmap, new SKRect(posX, posY, posX + scaledW, posY + scaledH), paint);
                }
                break;
        }

        return targetBitmap;
    }
}
