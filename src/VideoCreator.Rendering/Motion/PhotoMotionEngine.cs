using System;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Interpolation;
using VideoCreator.Core.Models;

namespace VideoCreator.Rendering.Motion;

public static class PhotoMotionEngine
{
    public static SKMatrix ComputeMotionMatrix(
        MotionPreset preset,
        TimeSpan clipTime,
        TimeSpan clipDuration,
        float canvasWidth,
        float canvasHeight,
        float imageWidth,
        float imageHeight,
        Transform customTransform)
    {
        double progress = 0.0;
        if (clipDuration.TotalSeconds > 0)
        {
            progress = Math.Clamp(clipTime.TotalSeconds / clipDuration.TotalSeconds, 0.0, 1.0);
        }

        // Smooth ease-in-out curve for natural camera motion
        double easeT = KeyframeInterpolator.Ease(progress, InterpolationType.EaseInOut);

        float baseScale = Math.Max(canvasWidth / imageWidth, canvasHeight / imageHeight);
        float scale = baseScale;
        float transX = 0;
        float transY = 0;

        float maxPanX = (imageWidth * baseScale - canvasWidth) * 0.5f;
        float maxPanY = (imageHeight * baseScale - canvasHeight) * 0.5f;
        if (maxPanX < 20) maxPanX = 40;
        if (maxPanY < 20) maxPanY = 40;

        switch (preset)
        {
            case MotionPreset.ZoomIn:
                // Start at 1.0x base scale, smoothly zoom in to 1.15x
                scale = baseScale * (float)KeyframeInterpolator.Interpolate(1.0, 1.15, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.ZoomOut:
                // Start zoomed in at 1.15x, zoom out to 1.0x
                scale = baseScale * (float)KeyframeInterpolator.Interpolate(1.15, 1.0, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.PanLeft:
                scale = baseScale * 1.08f;
                transX = (float)KeyframeInterpolator.Interpolate(maxPanX, -maxPanX, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.PanRight:
                scale = baseScale * 1.08f;
                transX = (float)KeyframeInterpolator.Interpolate(-maxPanX, maxPanX, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.PanUp:
                scale = baseScale * 1.08f;
                transY = (float)KeyframeInterpolator.Interpolate(maxPanY, -maxPanY, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.PanDown:
                scale = baseScale * 1.08f;
                transY = (float)KeyframeInterpolator.Interpolate(-maxPanY, maxPanY, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.DiagonalUpLeft:
                scale = baseScale * (float)KeyframeInterpolator.Interpolate(1.02, 1.12, easeT, InterpolationType.EaseInOut);
                transX = (float)KeyframeInterpolator.Interpolate(maxPanX * 0.5, -maxPanX * 0.5, easeT, InterpolationType.EaseInOut);
                transY = (float)KeyframeInterpolator.Interpolate(maxPanY * 0.5, -maxPanY * 0.5, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.DiagonalDownRight:
                scale = baseScale * (float)KeyframeInterpolator.Interpolate(1.02, 1.12, easeT, InterpolationType.EaseInOut);
                transX = (float)KeyframeInterpolator.Interpolate(-maxPanX * 0.5, maxPanX * 0.5, easeT, InterpolationType.EaseInOut);
                transY = (float)KeyframeInterpolator.Interpolate(-maxPanY * 0.5, maxPanY * 0.5, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.Cinematic:
                // Gentle slow zoom in with very subtle pan
                scale = baseScale * (float)KeyframeInterpolator.Interpolate(1.0, 1.10, easeT, InterpolationType.EaseInOut);
                transX = (float)KeyframeInterpolator.Interpolate(-maxPanX * 0.3, maxPanX * 0.3, easeT, InterpolationType.EaseInOut);
                break;

            case MotionPreset.None:
            default:
                scale = baseScale;
                break;
        }

        // Apply custom transforms
        scale *= (float)customTransform.ScaleX;
        transX += (float)customTransform.PositionX;
        transY += (float)customTransform.PositionY;

        float scaledW = imageWidth * scale;
        float scaledH = imageHeight * scale;
        float centerX = (canvasWidth - scaledW) / 2.0f + transX;
        float centerY = (canvasHeight - scaledH) / 2.0f + transY;

        var matrix = SKMatrix.CreateIdentity();
        matrix = SKMatrix.Concat(matrix, SKMatrix.CreateScale(scale, scale));
        matrix = SKMatrix.Concat(SKMatrix.CreateTranslation(centerX, centerY), matrix);

        if (Math.Abs(customTransform.RotationDegrees) > 0.01)
        {
            var rotMatrix = SKMatrix.CreateRotationDegrees((float)customTransform.RotationDegrees, canvasWidth * 0.5f, canvasHeight * 0.5f);
            matrix = SKMatrix.Concat(rotMatrix, matrix);
        }

        return matrix;
    }
}
