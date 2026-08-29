using System;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;

namespace VideoCreator.App.Controls;

public class TimelineCanvasControl : Control
{
    public static readonly StyledProperty<Project?> ProjectProperty =
        AvaloniaProperty.Register<TimelineCanvasControl, Project?>(nameof(Project));

    public static readonly StyledProperty<TimeSpan> PlayheadPositionProperty =
        AvaloniaProperty.Register<TimelineCanvasControl, TimeSpan>(nameof(PlayheadPosition), TimeSpan.Zero);

    public static readonly StyledProperty<Clip?> SelectedClipProperty =
        AvaloniaProperty.Register<TimelineCanvasControl, Clip?>(nameof(SelectedClip));

    public static readonly StyledProperty<double> PixelsPerSecondProperty =
        AvaloniaProperty.Register<TimelineCanvasControl, double>(nameof(PixelsPerSecond), 60.0);

    public Project? Project
    {
        get => GetValue(ProjectProperty);
        set => SetValue(ProjectProperty, value);
    }

    public TimeSpan PlayheadPosition
    {
        get => GetValue(PlayheadPositionProperty);
        set => SetValue(PlayheadPositionProperty, value);
    }

    public Clip? SelectedClip
    {
        get => GetValue(SelectedClipProperty);
        set => SetValue(SelectedClipProperty, value);
    }

    public double PixelsPerSecond
    {
        get => GetValue(PixelsPerSecondProperty);
        set => SetValue(PixelsPerSecondProperty, value);
    }

    public event EventHandler<TimeSpan>? SeekRequested;
    public event EventHandler<Clip?>? ClipSelectionChanged;

    private const double HeaderWidth = 140.0;
    private const double RulerHeight = 28.0;
    private const double TrackHeight = 64.0;
    private const double TrackSpacing = 6.0;

    private bool _isDraggingPlayhead;

    static TimelineCanvasControl()
    {
        AffectsRender<TimelineCanvasControl>(ProjectProperty, PlayheadPositionProperty, SelectedClipProperty, PixelsPerSecondProperty);
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        var bounds = Bounds;
        if (bounds.Width <= 10 || bounds.Height <= 10) return;

        // Background
        context.FillRectangle(new SolidColorBrush(Color.Parse("#111318")), new Rect(0, 0, bounds.Width, bounds.Height));

        if (Project == null || Project.Timeline.Tracks.Count == 0)
        {
            var emptyText = new FormattedText(
                "Timeline is empty. Add photos to start editing.",
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface("Inter"),
                14,
                new SolidColorBrush(Color.Parse("#475569")));
            context.DrawText(emptyText, new Point(HeaderWidth + 20, RulerHeight + 30));
            return;
        }

        double totalDurSec = Math.Max(10.0, Project.Timeline.TotalDuration.TotalSeconds + 5.0);
        double timelineWidth = totalDurSec * PixelsPerSecond;

        // 1. Draw Time Ruler
        context.FillRectangle(new SolidColorBrush(Color.Parse("#1A1D24")), new Rect(0, 0, bounds.Width, RulerHeight));
        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#262A34")), 1), new Point(0, RulerHeight), new Point(bounds.Width, RulerHeight));

        // Ruler second tick marks
        for (int sec = 0; sec <= (int)totalDurSec; sec++)
        {
            double x = HeaderWidth + sec * PixelsPerSecond;
            if (x > bounds.Width) break;

            bool isMajor = sec % 5 == 0;
            double tickH = isMajor ? 12 : 6;
            context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#475569")), 1), new Point(x, RulerHeight - tickH), new Point(x, RulerHeight));

            if (isMajor)
            {
                var timeStr = TimeSpan.FromSeconds(sec).ToString(@"mm\:ss");
                var timeText = new FormattedText(
                    timeStr,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    new Typeface("Inter", FontStyle.Normal, FontWeight.SemiBold),
                    10,
                    new SolidColorBrush(Color.Parse("#94A3B8")));
                context.DrawText(timeText, new Point(x + 3, 4));
            }
        }

        // 2. Draw Tracks & Clips
        double currentY = RulerHeight + TrackSpacing;

        foreach (var track in Project.Timeline.Tracks.OrderBy(t => t.OrderIndex))
        {
            // Track Header
            var headerRect = new Rect(0, currentY, HeaderWidth, TrackHeight);
            context.FillRectangle(new SolidColorBrush(Color.Parse("#161922")), headerRect);
            context.DrawRectangle(null, new Pen(new SolidColorBrush(Color.Parse("#232734")), 1), headerRect);

            // Track Type Icon / Name
            string trackLabel = track.Type switch
            {
                TrackType.Video => $"🎬 {track.Name}",
                TrackType.Overlay => $"🔤 {track.Name}",
                TrackType.Audio => $"🎵 {track.Name}",
                TrackType.Effect => $"✨ {track.Name}",
                _ => track.Name
            };

            var trackText = new FormattedText(
                trackLabel,
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface("Inter", FontStyle.Normal, FontWeight.Medium),
                12,
                new SolidColorBrush(Color.Parse("#E2E8F0")));
            context.DrawText(trackText, new Point(12, currentY + (TrackHeight - trackText.Height) / 2));

            // Track Lane Background
            var laneRect = new Rect(HeaderWidth, currentY, bounds.Width - HeaderWidth, TrackHeight);
            context.FillRectangle(new SolidColorBrush(Color.Parse("#13161F")), laneRect);
            context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#1E222D")), 1), new Point(HeaderWidth, currentY + TrackHeight), new Point(bounds.Width, currentY + TrackHeight));

            // Render Clips in this track
            foreach (var clip in track.Clips)
            {
                double clipX = HeaderWidth + clip.StartTime.TotalSeconds * PixelsPerSecond;
                double clipW = Math.Max(24.0, clip.Duration.TotalSeconds * PixelsPerSecond);
                var clipRect = new Rect(clipX, currentY + 3, clipW, TrackHeight - 6);

                bool isSelected = SelectedClip?.Id == clip.Id;

                Color clipBgColor = track.Type switch
                {
                    TrackType.Video => Color.Parse("#1E3A8A"), // Deep Blue
                    TrackType.Overlay => Color.Parse("#4C1D95"), // Deep Purple
                    TrackType.Audio => Color.Parse("#064E3B"), // Deep Emerald
                    _ => Color.Parse("#334155")
                };

                if (isSelected) clipBgColor = Color.Parse("#2563EB"); // Bright Blue

                // Clip Container Pill
                context.FillRectangle(new SolidColorBrush(clipBgColor), clipRect, 6);
                var borderPen = new Pen(new SolidColorBrush(isSelected ? Color.Parse("#60A5FA") : Color.Parse("#3B82F6")), isSelected ? 2 : 1);
                context.DrawRectangle(null, borderPen, clipRect, 6, 6);

                // Clip Name Label
                var clipTitle = new FormattedText(
                    clip.Name,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    new Typeface("Inter", FontStyle.Normal, FontWeight.SemiBold),
                    11,
                    new SolidColorBrush(Color.Parse("#FFFFFF")));
                context.DrawText(clipTitle, new Point(clipX + 8, currentY + 8));

                // Clip Duration / Details
                string details = $"{clip.Duration.TotalSeconds:0.0}s";
                if (clip is ImageClip img && img.Motion != MotionPreset.None) details += $" • {img.Motion}";
                if (clip.TransitionOut != null) details += $" • {clip.TransitionOut.Type}";

                var detailsText = new FormattedText(
                    details,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    new Typeface("Inter"),
                    10,
                    new SolidColorBrush(Color.Parse("#93C5FD")));
                context.DrawText(detailsText, new Point(clipX + 8, currentY + 28));

                // Waveform rendering for audio clips
                if (clip is AudioClip audio && audio.WaveformData.Count > 0)
                {
                    double waveW = clipW - 16;
                    double waveMidY = currentY + TrackHeight - 14;
                    int samples = audio.WaveformData.Count;
                    double step = waveW / samples;

                    for (int s = 0; s < samples; s++)
                    {
                        double wx = clipX + 8 + s * step;
                        double amp = audio.WaveformData[s] * 12.0;
                        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#34D399")), 1), new Point(wx, waveMidY - amp), new Point(wx, waveMidY + amp));
                    }
                }
            }

            currentY += TrackHeight + TrackSpacing;
        }

        // 3. Draw Header separator line
        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#262A34")), 2), new Point(HeaderWidth, 0), new Point(HeaderWidth, bounds.Height));

        // 4. Draw Playhead Needle
        double playheadX = HeaderWidth + PlayheadPosition.TotalSeconds * PixelsPerSecond;
        if (playheadX >= HeaderWidth && playheadX <= bounds.Width)
        {
            // Red playhead line
            context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#EF4444")), 2), new Point(playheadX, 0), new Point(playheadX, bounds.Height));

            // Playhead triangle cap
            var capPath = new PathGeometry();
            using (var ctx = capPath.Open())
            {
                ctx.BeginFigure(new Point(playheadX - 6, 0), true);
                ctx.LineTo(new Point(playheadX + 6, 0));
                ctx.LineTo(new Point(playheadX + 6, RulerHeight - 6));
                ctx.LineTo(new Point(playheadX, RulerHeight));
                ctx.LineTo(new Point(playheadX - 6, RulerHeight - 6));
                ctx.EndFigure(true);
            }
            context.DrawGeometry(new SolidColorBrush(Color.Parse("#EF4444")), null, capPath);
        }
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var pt = e.GetPosition(this);

        if (pt.X >= HeaderWidth)
        {
            double timeSec = Math.Max(0, (pt.X - HeaderWidth) / PixelsPerSecond);
            var seekTime = TimeSpan.FromSeconds(timeSec);
            SeekRequested?.Invoke(this, seekTime);
            _isDraggingPlayhead = true;

            // Check if user clicked on a clip
            double currentY = RulerHeight + TrackSpacing;
            Clip? clickedClip = null;

            if (Project != null)
            {
                foreach (var track in Project.Timeline.Tracks.OrderBy(t => t.OrderIndex))
                {
                    if (pt.Y >= currentY && pt.Y <= currentY + TrackHeight)
                    {
                        clickedClip = track.Clips.FirstOrDefault(c => pt.X >= (HeaderWidth + c.StartTime.TotalSeconds * PixelsPerSecond) &&
                                                                     pt.X <= (HeaderWidth + c.EndTime.TotalSeconds * PixelsPerSecond));
                        break;
                    }
                    currentY += TrackHeight + TrackSpacing;
                }
            }

            ClipSelectionChanged?.Invoke(this, clickedClip);
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        if (_isDraggingPlayhead)
        {
            var pt = e.GetPosition(this);
            double timeSec = Math.Max(0, (pt.X - HeaderWidth) / PixelsPerSecond);
            SeekRequested?.Invoke(this, TimeSpan.FromSeconds(timeSec));
        }
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        _isDraggingPlayhead = false;
    }
}
