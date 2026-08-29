using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Media.ImageProcessing;
using VideoCreator.Rendering.Effects;
using VideoCreator.Rendering.Motion;
using VideoCreator.Rendering.Text;
using VideoCreator.Rendering.Transitions;

namespace VideoCreator.Rendering.Preview;

public class PreviewRenderer : IPreviewRenderer
{
    private readonly ConcurrentDictionary<string, SKBitmap> _imageCache = new();
    private readonly SmartCropService _smartCropService = new();

    public void InvalidateCache()
    {
        foreach (var bmp in _imageCache.Values) bmp.Dispose();
        _imageCache.Clear();
    }

    public Task<SKBitmap> RenderFrameAsync(Project project, TimeSpan timestamp, int targetWidth, int targetHeight, CancellationToken ct = default)
    {
        return Task.Run(() => RenderFrame(project, timestamp, targetWidth, targetHeight), ct);
    }

    public SKBitmap RenderFrame(Project project, TimeSpan timestamp, int targetWidth, int targetHeight)
    {
        var output = new SKBitmap(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var canvas = new SKCanvas(output);

        // 1. Background clear
        SKColor bgColor = SKColor.TryParse(project.Canvas.BackgroundColorHex, out var parsedBg) ? parsedBg : SKColors.Black;
        canvas.Clear(bgColor);

        // 2. Render Video/Image Track
        var videoTrack = project.Timeline.Tracks.FirstOrDefault(t => t.Type == TrackType.Video && !t.IsMuted);
        if (videoTrack != null)
        {
            RenderVideoTrack(canvas, videoTrack, timestamp, targetWidth, targetHeight);
        }

        // 3. Render Overlay Track (Stickers, Shapes, Second video layers)
        var overlayTrack = project.Timeline.Tracks.FirstOrDefault(t => t.Type == TrackType.Overlay && !t.IsMuted);
        if (overlayTrack != null)
        {
            RenderOverlayTrack(canvas, overlayTrack, timestamp, targetWidth, targetHeight);
        }

        // 4. Global Project Effects if any
        var effectTrack = project.Timeline.Tracks.FirstOrDefault(t => t.Type == TrackType.Effect && !t.IsMuted);
        if (effectTrack != null)
        {
            var activeEffectClips = effectTrack.Clips.Where(c => timestamp >= c.StartTime && timestamp < c.EndTime);
            foreach (var clip in activeEffectClips)
            {
                if (clip.Effects.Any(e => e.Type == EffectType.Vignette))
                {
                    var vig = clip.Effects.First(e => e.Type == EffectType.Vignette);
                    EffectsProcessor.DrawVignetteOverlay(canvas, targetWidth, targetHeight, (float)vig.Intensity);
                }
            }
        }

        return output;
    }

    private void RenderVideoTrack(SKCanvas canvas, Track track, TimeSpan timestamp, int targetWidth, int targetHeight)
    {
        // Find clip active at timestamp
        for (int i = 0; i < track.Clips.Count; i++)
        {
            var clip = track.Clips[i];
            if (timestamp >= clip.StartTime && timestamp < clip.EndTime)
            {
                TimeSpan localTime = timestamp - clip.StartTime;

                // Check for Transition Out to next clip
                if (clip.TransitionOut != null && clip.TransitionOut.Type != TransitionType.None && i + 1 < track.Clips.Count)
                {
                    var nextClip = track.Clips[i + 1];
                    TimeSpan transDur = clip.TransitionOut.Duration;
                    TimeSpan transStartTime = clip.Duration - transDur;

                    if (localTime >= transStartTime && transDur > TimeSpan.Zero)
                    {
                        double progress = (localTime - transStartTime).TotalSeconds / transDur.TotalSeconds;

                        using var fromBmp = RenderSingleClip(clip, localTime, targetWidth, targetHeight);
                        using var toBmp = RenderSingleClip(nextClip, TimeSpan.Zero, targetWidth, targetHeight);

                        TransitionRenderer.RenderTransition(canvas, fromBmp, toBmp, clip.TransitionOut, progress, targetWidth, targetHeight);
                        return;
                    }
                }

                // Normal single clip rendering
                using var clipBmp = RenderSingleClip(clip, localTime, targetWidth, targetHeight);
                canvas.DrawBitmap(clipBmp, new SKRect(0, 0, targetWidth, targetHeight));
                return;
            }
        }
    }

    private SKBitmap RenderSingleClip(Clip clip, TimeSpan localTime, int targetWidth, int targetHeight)
    {
        var clipOutput = new SKBitmap(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var canvas = new SKCanvas(clipOutput);
        canvas.Clear(SKColors.Transparent);

        if (clip is ImageClip imgClip)
        {
            var sourceBmp = GetOrLoadBitmap(imgClip.SourceFilePath);
            if (sourceBmp != null)
            {
                // Apply smart crop / blur background first if required
                SKBitmap baseBmp = sourceBmp;
                bool needDisposeBase = false;

                if (imgClip.CropMode == CropMode.BlurBackground)
                {
                    baseBmp = _smartCropService.ApplyCropAndBackground(sourceBmp, targetWidth, targetHeight, CropMode.BlurBackground);
                    needDisposeBase = true;
                }

                // Compute motion transform matrix
                var matrix = PhotoMotionEngine.ComputeMotionMatrix(
                    imgClip.Motion,
                    localTime,
                    imgClip.Duration,
                    targetWidth,
                    targetHeight,
                    baseBmp.Width,
                    baseBmp.Height,
                    imgClip.Transform);

                // Create paint with effects
                using var effectsPaint = EffectsProcessor.CreateEffectsPaint(imgClip.Effects, targetWidth, targetHeight);

                canvas.Save();
                canvas.SetMatrix(matrix);
                canvas.DrawBitmap(baseBmp, new SKPoint(0, 0), effectsPaint);
                canvas.Restore();

                if (needDisposeBase) baseBmp.Dispose();
            }
        }
        else if (clip is TextClip textClip)
        {
            TextRenderer.RenderTextOverlay(canvas, textClip.Overlay, textClip.Transform, localTime, textClip.Duration, targetWidth, targetHeight);
        }

        return clipOutput;
    }

    private void RenderOverlayTrack(SKCanvas canvas, Track track, TimeSpan timestamp, int targetWidth, int targetHeight)
    {
        var activeClips = track.Clips.Where(c => timestamp >= c.StartTime && timestamp < c.EndTime);
        foreach (var clip in activeClips)
        {
            TimeSpan localTime = timestamp - clip.StartTime;
            if (clip is TextClip textClip)
            {
                TextRenderer.RenderTextOverlay(canvas, textClip.Overlay, textClip.Transform, localTime, textClip.Duration, targetWidth, targetHeight);
            }
            else if (clip is ShapeClip shapeClip)
            {
                RenderShapeClip(canvas, shapeClip, targetWidth, targetHeight);
            }
        }
    }

    private static void RenderShapeClip(SKCanvas canvas, ShapeClip shape, int canvasWidth, int canvasHeight)
    {
        float x = canvasWidth * (float)shape.Transform.AnchorX + (float)shape.Transform.PositionX;
        float y = canvasHeight * (float)shape.Transform.AnchorY + (float)shape.Transform.PositionY;
        float w = (float)(shape.Width * shape.Transform.ScaleX);
        float h = (float)(shape.Height * shape.Transform.ScaleY);

        SKColor fill = SKColor.TryParse(shape.FillColorHex, out var parsedFill) ? parsedFill : SKColors.White;
        fill = fill.WithAlpha((byte)(fill.Alpha * shape.Transform.Opacity));

        using var paint = new SKPaint { Color = fill, IsAntialias = true, Style = SKPaintStyle.Fill };
        var rect = new SKRect(x - w * 0.5f, y - h * 0.5f, x + w * 0.5f, y + h * 0.5f);

        switch (shape.Shape)
        {
            case ShapeType.Circle:
                canvas.DrawOval(rect, paint);
                break;
            case ShapeType.RoundedRectangle:
            case ShapeType.Pill:
                canvas.DrawRoundRect(new SKRoundRect(rect, (float)shape.CornerRadius, (float)shape.CornerRadius), paint);
                break;
            case ShapeType.Rectangle:
            default:
                canvas.DrawRect(rect, paint);
                break;
        }
    }

    private SKBitmap? GetOrLoadBitmap(string filePath)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return null;

        return _imageCache.GetOrAdd(filePath, path =>
        {
            try
            {
                return SKBitmap.Decode(path);
            }
            catch
            {
                return new SKBitmap(100, 100);
            }
        });
    }
}
