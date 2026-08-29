using System;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Interpolation;
using VideoCreator.Core.Models.Transitions;

namespace VideoCreator.Rendering.Transitions;

public static class TransitionRenderer
{
    public static void RenderTransition(
        SKCanvas canvas,
        SKBitmap fromBitmap,
        SKBitmap toBitmap,
        Transition transition,
        double progress,
        float canvasWidth,
        float canvasHeight)
    {
        progress = Math.Clamp(progress, 0.0, 1.0);
        double easeT = KeyframeInterpolator.Ease(progress, transition.Easing);

        switch (transition.Type)
        {
            case TransitionType.Fade:
            case TransitionType.CrossDissolve:
                // Draw outgoing frame at 100%
                canvas.DrawBitmap(fromBitmap, new SKRect(0, 0, canvasWidth, canvasHeight));
                // Draw incoming frame with cross-fade alpha
                using (var paint = new SKPaint
                {
                    Color = new SKColor(255, 255, 255, (byte)(easeT * 255)),
                    FilterQuality = SKFilterQuality.High
                })
                {
                    canvas.DrawBitmap(toBitmap, new SKRect(0, 0, canvasWidth, canvasHeight), paint);
                }
                break;

            case TransitionType.SlideLeft:
                float slideLeftOffset = (float)(easeT * canvasWidth);
                canvas.DrawBitmap(fromBitmap, new SKRect(-slideLeftOffset, 0, canvasWidth - slideLeftOffset, canvasHeight));
                canvas.DrawBitmap(toBitmap, new SKRect(canvasWidth - slideLeftOffset, 0, 2 * canvasWidth - slideLeftOffset, canvasHeight));
                break;

            case TransitionType.SlideRight:
                float slideRightOffset = (float)(easeT * canvasWidth);
                canvas.DrawBitmap(fromBitmap, new SKRect(slideRightOffset, 0, canvasWidth + slideRightOffset, canvasHeight));
                canvas.DrawBitmap(toBitmap, new SKRect(-canvasWidth + slideRightOffset, 0, slideRightOffset, canvasHeight));
                break;

            case TransitionType.SlideUp:
                float slideUpOffset = (float)(easeT * canvasHeight);
                canvas.DrawBitmap(fromBitmap, new SKRect(0, -slideUpOffset, canvasWidth, canvasHeight - slideUpOffset));
                canvas.DrawBitmap(toBitmap, new SKRect(0, canvasHeight - slideUpOffset, canvasWidth, 2 * canvasHeight - slideUpOffset));
                break;

            case TransitionType.SlideDown:
                float slideDownOffset = (float)(easeT * canvasHeight);
                canvas.DrawBitmap(fromBitmap, new SKRect(0, slideDownOffset, canvasWidth, canvasHeight + slideDownOffset));
                canvas.DrawBitmap(toBitmap, new SKRect(0, -canvasHeight + slideDownOffset, canvasWidth, slideDownOffset));
                break;

            case TransitionType.Push:
                float pushX = (float)(easeT * canvasWidth);
                canvas.DrawBitmap(fromBitmap, new SKRect(-pushX, 0, canvasWidth - pushX, canvasHeight));
                canvas.DrawBitmap(toBitmap, new SKRect(canvasWidth - pushX, 0, 2 * canvasWidth - pushX, canvasHeight));
                break;

            case TransitionType.Zoom:
                float fromZoom = 1.0f + (float)easeT * 0.3f;
                float toZoom = 0.8f + (float)easeT * 0.2f;

                // Outgoing zooming in and fading
                using (var fromPaint = new SKPaint
                {
                    Color = new SKColor(255, 255, 255, (byte)((1.0 - easeT) * 255)),
                    FilterQuality = SKFilterQuality.High
                })
                {
                    float fw = canvasWidth * fromZoom;
                    float fh = canvasHeight * fromZoom;
                    canvas.DrawBitmap(fromBitmap, new SKRect((canvasWidth - fw) / 2, (canvasHeight - fh) / 2, (canvasWidth + fw) / 2, (canvasHeight + fh) / 2), fromPaint);
                }

                // Incoming zooming to normal
                using (var toPaint = new SKPaint
                {
                    Color = new SKColor(255, 255, 255, (byte)(easeT * 255)),
                    FilterQuality = SKFilterQuality.High
                })
                {
                    float tw = canvasWidth * toZoom;
                    float th = canvasHeight * toZoom;
                    canvas.DrawBitmap(toBitmap, new SKRect((canvasWidth - tw) / 2, (canvasHeight - th) / 2, (canvasWidth + tw) / 2, (canvasHeight + th) / 2), toPaint);
                }
                break;

            case TransitionType.Wipe:
                float wipeX = (float)(easeT * canvasWidth);
                // Draw base fromBitmap
                canvas.DrawBitmap(fromBitmap, new SKRect(0, 0, canvasWidth, canvasHeight));
                // Draw wiped portion of toBitmap
                canvas.Save();
                canvas.ClipRect(new SKRect(0, 0, wipeX, canvasHeight));
                canvas.DrawBitmap(toBitmap, new SKRect(0, 0, canvasWidth, canvasHeight));
                canvas.Restore();
                break;

            case TransitionType.None:
            default:
                canvas.DrawBitmap(easeT < 0.5 ? fromBitmap : toBitmap, new SKRect(0, 0, canvasWidth, canvasHeight));
                break;
        }
    }
}
