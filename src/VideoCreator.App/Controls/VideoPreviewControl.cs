using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using SkiaSharp;
using VideoCreator.Core.Models;
using VideoCreator.Rendering.Preview;

namespace VideoCreator.App.Controls;

public class VideoPreviewControl : Control
{
    public static readonly StyledProperty<Project?> ProjectProperty =
        AvaloniaProperty.Register<VideoPreviewControl, Project?>(nameof(Project));

    public static readonly StyledProperty<TimeSpan> CurrentTimeProperty =
        AvaloniaProperty.Register<VideoPreviewControl, TimeSpan>(nameof(CurrentTime), TimeSpan.Zero);

    public Project? Project
    {
        get => GetValue(ProjectProperty);
        set => SetValue(ProjectProperty, value);
    }

    public TimeSpan CurrentTime
    {
        get => GetValue(CurrentTimeProperty);
        set => SetValue(CurrentTimeProperty, value);
    }

    private readonly IPreviewRenderer _renderer = new PreviewRenderer();
    private WriteableBitmap? _displayBitmap;
    private int _lastWidth = 0;
    private int _lastHeight = 0;

    static VideoPreviewControl()
    {
        AffectsRender<VideoPreviewControl>(ProjectProperty, CurrentTimeProperty);
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        var bounds = Bounds;
        if (bounds.Width <= 10 || bounds.Height <= 10) return;

        // Draw dark viewport background
        context.FillRectangle(new SolidColorBrush(Color.Parse("#0F1117")), new Rect(0, 0, bounds.Width, bounds.Height));

        if (Project == null)
        {
            // Empty state message
            var formattedText = new FormattedText(
                "No Media Loaded\nImport photos or create a project to start preview",
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface("Inter", FontStyle.Normal, FontWeight.Medium),
                15,
                new SolidColorBrush(Color.Parse("#64748B")));
            context.DrawText(formattedText, new Point((bounds.Width - formattedText.Width) / 2, (bounds.Height - formattedText.Height) / 2));
            return;
        }

        // Calculate aspect ratio destination rect inside bounds
        double canvasRatio = (double)Project.Canvas.Width / Project.Canvas.Height;
        double viewRatio = bounds.Width / bounds.Height;

        double destWidth, destHeight;
        if (viewRatio > canvasRatio)
        {
            destHeight = bounds.Height - 20;
            destWidth = destHeight * canvasRatio;
        }
        else
        {
            destWidth = bounds.Width - 20;
            destHeight = destWidth / canvasRatio;
        }

        double destX = (bounds.Width - destWidth) / 2.0;
        double destY = (bounds.Height - destHeight) / 2.0;
        var destRect = new Rect(destX, destY, destWidth, destHeight);

        // Render preview frame at scaled resolution for smooth performance
        int renderWidth = Math.Min(Project.Canvas.Width, 960);
        int renderHeight = (int)(renderWidth / canvasRatio);

        try
        {
            using var skiaFrame = _renderer.RenderFrame(Project, CurrentTime, renderWidth, renderHeight);

            if (_displayBitmap == null || _lastWidth != renderWidth || _lastHeight != renderHeight)
            {
                _displayBitmap?.Dispose();
                _displayBitmap = new WriteableBitmap(
                    new PixelSize(renderWidth, renderHeight),
                    new Vector(96, 96),
                    PixelFormat.Bgra8888,
                    AlphaFormat.Premul);
                _lastWidth = renderWidth;
                _lastHeight = renderHeight;
            }

            using (var fb = _displayBitmap.Lock())
            {
                // Copy Skia RGBA pixels to Avalonia BGRA buffer
                var skPixels = skiaFrame.GetPixels();
                unsafe
                {
                    byte* src = (byte*)skPixels.ToPointer();
                    byte* dst = (byte*)fb.Address.ToPointer();
                    int totalBytes = renderWidth * renderHeight * 4;

                    for (int i = 0; i < totalBytes; i += 4)
                    {
                        dst[i + 0] = src[i + 2]; // B
                        dst[i + 1] = src[i + 1]; // G
                        dst[i + 2] = src[i + 0]; // R
                        dst[i + 3] = src[i + 3]; // A
                    }
                }
            }

            // Draw shadow box around video canvas
            context.FillRectangle(new SolidColorBrush(Color.Parse("#000000")), destRect);
            context.DrawImage(_displayBitmap, destRect);
            context.DrawRectangle(null, new Pen(new SolidColorBrush(Color.Parse("#334155")), 1), destRect);
        }
        catch (Exception ex)
        {
            var errText = new FormattedText(
                $"Preview Render Error: {ex.Message}",
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface("Inter"),
                12,
                new SolidColorBrush(Color.Parse("#EF4444")));
            context.DrawText(errText, new Point(10, 10));
        }
    }
}
