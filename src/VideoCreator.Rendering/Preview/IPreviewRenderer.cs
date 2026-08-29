using System;
using System.Threading;
using System.Threading.Tasks;
using SkiaSharp;
using VideoCreator.Core.Models;

namespace VideoCreator.Rendering.Preview;

public interface IPreviewRenderer
{
    SKBitmap RenderFrame(Project project, TimeSpan timestamp, int targetWidth, int targetHeight);
    Task<SKBitmap> RenderFrameAsync(Project project, TimeSpan timestamp, int targetWidth, int targetHeight, CancellationToken ct = default);
    void InvalidateCache();
}
