using System;
using System.Collections.Generic;
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
    public event EventHandler? TimelineModified;

    private const double HeaderWidth = 140.0;
    private const double RulerHeight = 28.0;
    private const double TrackHeight = 60.0;
    private const double TrackSpacing = 6.0;
    private const double ResizeHandleWidth = 10.0;

    private enum DragMode
    {
        None,
        Playhead,
        ResizeLeft,
        ResizeRight,
        MoveClip,
        AudioRegion
    }

    private DragMode _currentDragMode = DragMode.None;
    private Clip? _draggedClip;
    private Track? _draggedTrack;
    private Point _dragStartPoint;
    private TimeSpan _dragStartClipTime;
    private TimeSpan _dragStartClipDuration;
    private TimeSpan _dragStartAudioTrim;

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
        context.FillRectangle(new SolidColorBrush(Color.Parse("#0D1017")), new Rect(0, 0, bounds.Width, bounds.Height));

        if (Project == null || Project.Timeline.Tracks.Count == 0)
        {
            var emptyText = new FormattedText(
                "Timeline is empty. Add photos and music to start creating.",
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface("Inter"),
                13,
                new SolidColorBrush(Color.Parse("#475569")));
            context.DrawText(emptyText, new Point(HeaderWidth + 20, RulerHeight + 30));
            return;
        }

        double totalDurSec = Math.Max(12.0, Project.Timeline.TotalDuration.TotalSeconds + 5.0);

        // 1. Time Ruler
        context.FillRectangle(new SolidColorBrush(Color.Parse("#131722")), new Rect(0, 0, bounds.Width, RulerHeight));
        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#1F2636")), 1), new Point(0, RulerHeight), new Point(bounds.Width, RulerHeight));

        for (int sec = 0; sec <= (int)totalDurSec; sec++)
        {
            double x = HeaderWidth + sec * PixelsPerSecond;
            if (x > bounds.Width) break;

            bool isMajor = sec % 5 == 0;
            double tickH = isMajor ? 12 : 6;
            context.DrawLine(new Pen(new SolidColorBrush(Color.Parse(isMajor ? "#64748B" : "#334155")), 1), new Point(x, RulerHeight - tickH), new Point(x, RulerHeight));

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

        // 2. Tracks & Clips
        double currentY = RulerHeight + TrackSpacing;

        foreach (var track in Project.Timeline.Tracks.OrderBy(t => t.OrderIndex))
        {
            // Track Header
            var headerRect = new Rect(0, currentY, HeaderWidth, TrackHeight);
            context.FillRectangle(new SolidColorBrush(Color.Parse("#151A24")), headerRect);
            context.DrawRectangle(null, new Pen(new SolidColorBrush(Color.Parse("#1E2433")), 1), headerRect);

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
                new Typeface("Inter", FontStyle.Normal, FontWeight.SemiBold),
                11,
                new SolidColorBrush(Color.Parse("#E2E8F0")));
            context.DrawText(trackText, new Point(12, currentY + (TrackHeight - trackText.Height) / 2));

            // Track Lane Background
            var laneRect = new Rect(HeaderWidth, currentY, bounds.Width - HeaderWidth, TrackHeight);
            context.FillRectangle(new SolidColorBrush(Color.Parse("#0F131C")), laneRect);
            context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#181E2B")), 1), new Point(HeaderWidth, currentY + TrackHeight), new Point(bounds.Width, currentY + TrackHeight));

            // Clips
            foreach (var clip in track.Clips)
            {
                double clipX = HeaderWidth + clip.StartTime.TotalSeconds * PixelsPerSecond;
                double clipW = Math.Max(28.0, clip.Duration.TotalSeconds * PixelsPerSecond);
                var clipRect = new Rect(clipX, currentY + 3, clipW, TrackHeight - 6);

                bool isSelected = SelectedClip?.Id == clip.Id;

                // Clip Body Colors & Styles matching README screenshot
                Color clipBgColor = track.Type switch
                {
                    TrackType.Video => Color.Parse("#1A202C"),    // Filmstrip Dark Slate
                    TrackType.Overlay => Color.Parse("#383256"),  // Deep Purple Titles
                    TrackType.Audio => Color.Parse("#1F1C18"),    // Dark Amber Audio
                    _ => Color.Parse("#232734")
                };

                // Golden glow if selected
                Color borderClr = isSelected ? Color.Parse("#F59E0B") : (track.Type == TrackType.Overlay ? Color.Parse("#52467A") : Color.Parse("#2D3748"));
                double borderThick = isSelected ? 2.0 : 1.0;

                // Clip Body Container
                context.FillRectangle(new SolidColorBrush(clipBgColor), clipRect, 4);
                context.DrawRectangle(null, new Pen(new SolidColorBrush(borderClr), borderThick), clipRect, 4, 4);

                // If Video Clip: Render Filmstrip simulation with thumbnail frames
                if (clip is ImageClip)
                {
                    // Mini frames divider lines
                    int frameCount = (int)Math.Max(1, clipW / 36.0);
                    for (int f = 1; f < frameCount; f++)
                    {
                        double fx = clipX + f * (clipW / frameCount);
                        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#2D3748")), 1), new Point(fx, currentY + 4), new Point(fx, currentY + TrackHeight - 8));
                    }
                }

                // If Overlay Clip: Render Titles Badge
                if (clip is TextClip || track.Type == TrackType.Overlay)
                {
                    var titleTag = new FormattedText(
                        "TITLES",
                        System.Globalization.CultureInfo.CurrentCulture,
                        FlowDirection.LeftToRight,
                        new Typeface("Inter", FontStyle.Normal, FontWeight.Bold),
                        9,
                        new SolidColorBrush(Color.Parse("#A78BFA")));
                    context.DrawText(titleTag, new Point(clipX + 8, currentY + 8));

                    var overlayTag = new FormattedText(
                        "OVERLAY",
                        System.Globalization.CultureInfo.CurrentCulture,
                        FlowDirection.LeftToRight,
                        new Typeface("Inter", FontStyle.Normal, FontWeight.Bold),
                        9,
                        new SolidColorBrush(Color.Parse("#A78BFA")));
                    context.DrawText(overlayTag, new Point(clipX + clipW - 55, currentY + 8));
                }

                // Clip Title
                string animBadge = "";
                if (clip is ImageClip img)
                {
                    animBadge = img.Motion switch
                    {
                        MotionPreset.ZoomIn => "🔍+",
                        MotionPreset.ZoomOut => "🔍-",
                        MotionPreset.ZoomInOut => "🔍⇄",
                        MotionPreset.PanLeft or MotionPreset.PanRightToLeft => "←",
                        MotionPreset.PanRight or MotionPreset.PanLeftToRight => "→",
                        MotionPreset.PanUp or MotionPreset.PanBottomToTop => "↑",
                        MotionPreset.PanDown or MotionPreset.PanTopToBottom => "↓",
                        MotionPreset.KenBurns => "🎬",
                        MotionPreset.DynamicZoom => "⚡",
                        MotionPreset.Cinematic => "✨",
                        MotionPreset.RandomMotion => "🎲",
                        _ => ""
                    };
                }

                string displayName = string.IsNullOrEmpty(animBadge) ? clip.Name.ToUpper() : $"{clip.Name.ToUpper()} {animBadge}";
                var clipTitle = new FormattedText(
                    displayName,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    new Typeface("Inter", FontStyle.Normal, FontWeight.Bold),
                    10,
                    new SolidColorBrush(Color.Parse("#F8FAFC")));
                context.DrawText(clipTitle, new Point(clipX + 8, currentY + (track.Type == TrackType.Overlay ? 22 : 6)));

                // Clip Duration / Details
                string details = $"{clip.Duration.TotalSeconds:0.0}s";
                var detailsText = new FormattedText(
                    details,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    new Typeface("Inter"),
                    9,
                    new SolidColorBrush(Color.Parse("#94A3B8")));
                context.DrawText(detailsText, new Point(clipX + 8, currentY + TrackHeight - 20));

                // Waveform rendering for audio clips
                if (clip is AudioClip audio)
                {
                    double waveW = clipW - 16;
                    double waveMidY = currentY + TrackHeight - 16;
                    int samples = audio.WaveformData.Count > 0 ? audio.WaveformData.Count : 40;
                    double step = waveW / samples;

                    for (int s = 0; s < samples; s++)
                    {
                        double wx = clipX + 8 + s * step;
                        double amp = (audio.WaveformData.Count > s ? audio.WaveformData[s] : (float)(Math.Sin(s * 0.3) * 0.5 + 0.5)) * 12.0;
                        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#FBBF24")), 1.5), new Point(wx, waveMidY - amp), new Point(wx, waveMidY + amp));
                    }
                }

                // Render Transition Out Pill if present
                if (clip.TransitionOut != null && clip.TransitionOut.Type != TransitionType.None)
                {
                    double transW = Math.Max(20.0, clip.TransitionOut.Duration.TotalSeconds * PixelsPerSecond);
                    var transRect = new Rect(clipX + clipW - transW, currentY + 3, transW, TrackHeight - 6);
                    context.FillRectangle(new SolidColorBrush(Color.Parse("#282D3D")), transRect, 3);
                    context.DrawRectangle(null, new Pen(new SolidColorBrush(Color.Parse("#3D465C")), 1), transRect, 3, 3);

                    var transText = new FormattedText(
                        clip.TransitionOut.Type.ToString(),
                        System.Globalization.CultureInfo.CurrentCulture,
                        FlowDirection.LeftToRight,
                        new Typeface("Inter", FontStyle.Normal, FontWeight.SemiBold),
                        9,
                        new SolidColorBrush(Color.Parse("#94A3B8")));
                    context.DrawText(transText, new Point(transRect.X + 4, currentY + (TrackHeight - transText.Height) / 2));
                }

                // Draw resize handles if selected
                if (isSelected)
                {
                    context.FillRectangle(new SolidColorBrush(Color.Parse("#F59E0B")), new Rect(clipX, currentY + 6, 3, TrackHeight - 12), 1.5f);
                    context.FillRectangle(new SolidColorBrush(Color.Parse("#F59E0B")), new Rect(clipX + clipW - 3, currentY + 6, 3, TrackHeight - 12), 1.5f);
                }
            }

            currentY += TrackHeight + TrackSpacing;
        }

        // 3. Header separator
        context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#1F2636")), 2), new Point(HeaderWidth, 0), new Point(HeaderWidth, bounds.Height));

        // 4. White Playhead Needle matching Screenshot
        double playheadX = HeaderWidth + PlayheadPosition.TotalSeconds * PixelsPerSecond;
        if (playheadX >= HeaderWidth && playheadX <= bounds.Width)
        {
            // Crisp white vertical playhead line
            context.DrawLine(new Pen(new SolidColorBrush(Color.Parse("#FFFFFF")), 1.5), new Point(playheadX, 0), new Point(playheadX, bounds.Height));

            // White flag cap
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
            context.DrawGeometry(new SolidColorBrush(Color.Parse("#FFFFFF")), null, capPath);
        }
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var pt = e.GetPosition(this);
        _dragStartPoint = pt;

        if (pt.X < HeaderWidth) return;

        if (pt.Y <= RulerHeight)
        {
            // Clicked on ruler -> seek playhead
            double timeSec = Math.Max(0, (pt.X - HeaderWidth) / PixelsPerSecond);
            SeekRequested?.Invoke(this, TimeSpan.FromSeconds(timeSec));
            _currentDragMode = DragMode.Playhead;
            return;
        }

        // Find clicked track and clip
        double currentY = RulerHeight + TrackSpacing;
        Clip? clickedClip = null;
        Track? clickedTrack = null;

        if (Project != null)
        {
            foreach (var track in Project.Timeline.Tracks.OrderBy(t => t.OrderIndex))
            {
                if (pt.Y >= currentY && pt.Y <= currentY + TrackHeight)
                {
                    clickedTrack = track;
                    clickedClip = track.Clips.FirstOrDefault(c => pt.X >= (HeaderWidth + c.StartTime.TotalSeconds * PixelsPerSecond) &&
                                                                 pt.X <= (HeaderWidth + c.EndTime.TotalSeconds * PixelsPerSecond));
                    break;
                }
                currentY += TrackHeight + TrackSpacing;
            }
        }

        if (clickedClip != null && clickedTrack != null)
        {
            _draggedClip = clickedClip;
            _draggedTrack = clickedTrack;
            _dragStartClipTime = clickedClip.StartTime;
            _dragStartClipDuration = clickedClip.Duration;
            if (clickedClip is AudioClip ac) _dragStartAudioTrim = ac.AudioSettings.TrimStart;

            double clipStartX = HeaderWidth + clickedClip.StartTime.TotalSeconds * PixelsPerSecond;
            double clipEndX = HeaderWidth + clickedClip.EndTime.TotalSeconds * PixelsPerSecond;

            // Check if right edge was clicked (resize duration)
            if (Math.Abs(pt.X - clipEndX) <= ResizeHandleWidth)
            {
                _currentDragMode = DragMode.ResizeRight;
            }
            else if (Math.Abs(pt.X - clipStartX) <= ResizeHandleWidth)
            {
                _currentDragMode = DragMode.ResizeLeft;
            }
            else if (clickedClip is AudioClip)
            {
                _currentDragMode = DragMode.AudioRegion;
            }
            else
            {
                _currentDragMode = DragMode.MoveClip;
            }

            SelectedClip = clickedClip;
            ClipSelectionChanged?.Invoke(this, clickedClip);
        }
        else
        {
            // Clicked empty timeline space -> seek playhead
            double timeSec = Math.Max(0, (pt.X - HeaderWidth) / PixelsPerSecond);
            SeekRequested?.Invoke(this, TimeSpan.FromSeconds(timeSec));
            _currentDragMode = DragMode.Playhead;
            ClipSelectionChanged?.Invoke(this, null);
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var pt = e.GetPosition(this);

        if (_currentDragMode == DragMode.Playhead)
        {
            double timeSec = Math.Max(0, (pt.X - HeaderWidth) / PixelsPerSecond);
            SeekRequested?.Invoke(this, TimeSpan.FromSeconds(timeSec));
            return;
        }

        if (_draggedClip != null && _draggedTrack != null)
        {
            double deltaX = pt.X - _dragStartPoint.X;
            double deltaSec = deltaX / PixelsPerSecond;

            if (_currentDragMode == DragMode.ResizeRight)
            {
                double newDur = Math.Max(0.5, _dragStartClipDuration.TotalSeconds + deltaSec);
                // Snap to whole seconds if close
                if (Math.Abs(newDur - Math.Round(newDur)) < 0.15) newDur = Math.Round(newDur);

                _draggedClip.Duration = TimeSpan.FromSeconds(newDur);
                RippleCompactTrack(_draggedTrack);
                TimelineModified?.Invoke(this, EventArgs.Empty);
                InvalidateVisual();
            }
            else if (_currentDragMode == DragMode.ResizeLeft)
            {
                double newDur = Math.Max(0.5, _dragStartClipDuration.TotalSeconds - deltaSec);
                _draggedClip.Duration = TimeSpan.FromSeconds(newDur);
                RippleCompactTrack(_draggedTrack);
                TimelineModified?.Invoke(this, EventArgs.Empty);
                InvalidateVisual();
            }
            else if (_currentDragMode == DragMode.AudioRegion && _draggedClip is AudioClip ac)
            {
                // Dragging song underneath video changes TrimStart (selected source region)
                double newTrim = Math.Max(0, _dragStartAudioTrim.TotalSeconds + deltaSec);
                ac.AudioSettings.TrimStart = TimeSpan.FromSeconds(newTrim);
                TimelineModified?.Invoke(this, EventArgs.Empty);
                InvalidateVisual();
            }
            else if (_currentDragMode == DragMode.MoveClip && _draggedTrack.Type == TrackType.Video)
            {
                // Drag-to-reorder photos
                int currentIndex = _draggedTrack.Clips.IndexOf(_draggedClip);
                if (currentIndex != -1)
                {
                    double targetSec = Math.Max(0, _dragStartClipTime.TotalSeconds + deltaSec);
                    int targetIndex = (int)Math.Clamp(targetSec / Math.Max(1.0, _draggedClip.Duration.TotalSeconds), 0, _draggedTrack.Clips.Count - 1);

                    if (targetIndex != currentIndex && targetIndex >= 0 && targetIndex < _draggedTrack.Clips.Count)
                    {
                        _draggedTrack.Clips.RemoveAt(currentIndex);
                        _draggedTrack.Clips.Insert(targetIndex, _draggedClip);
                        RippleCompactTrack(_draggedTrack);
                        TimelineModified?.Invoke(this, EventArgs.Empty);
                        InvalidateVisual();
                    }
                }
            }
        }
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        _currentDragMode = DragMode.None;
        _draggedClip = null;
        _draggedTrack = null;
    }

    private static void RippleCompactTrack(Track track)
    {
        if (track.Type == TrackType.Video)
        {
            TimeSpan cur = TimeSpan.Zero;
            foreach (var clip in track.Clips)
            {
                clip.StartTime = cur;
                cur += clip.Duration;
            }
        }
    }
}
