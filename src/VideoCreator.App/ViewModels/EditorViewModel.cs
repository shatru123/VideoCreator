using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoCreator.Application.Services;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Templates;
using VideoCreator.Media.Services;
using VideoCreator.Rendering.Preview;

namespace VideoCreator.App.ViewModels;

public partial class EditorViewModel : ViewModelBase
{
    private readonly IProjectService _projectService;
    private readonly ITimelineService _timelineService;
    private readonly IMediaEngine _mediaEngine;
    private readonly IPreviewRenderer _previewRenderer;
    private readonly Action _openExportModal;
    private readonly DispatcherTimer _playbackTimer;

    [ObservableProperty]
    private Project _currentProject;

    [ObservableProperty]
    private TimeSpan _currentTime = TimeSpan.Zero;

    [ObservableProperty]
    private bool _isPlaying;

    [ObservableProperty]
    private Clip? _selectedClip;

    [ObservableProperty]
    private double _timelineZoom = 60.0; // Pixels per second

    [ObservableProperty]
    private string _activeLibraryTab = "Photos"; // Photos, Music, Text, Templates, Effects, Transitions

    [ObservableProperty]
    private ObservableCollection<Asset> _libraryAssets = new();

    public string TimecodeDisplay => $"{CurrentTime:mm\\:ss\\.ff} / {CurrentProject.Timeline.TotalDuration:mm\\:ss\\.ff}";

    public ICommand PlayPauseCommand { get; }
    public ICommand StepForwardCommand { get; }
    public ICommand StepBackwardCommand { get; }
    public ICommand SeekCommand { get; }
    public ICommand SplitClipCommand { get; }
    public ICommand DeleteClipCommand { get; }
    public ICommand UndoCommand { get; }
    public ICommand RedoCommand { get; }
    public ICommand SaveCommand { get; }
    public ICommand OpenExportCommand { get; }
    public ICommand AddPhotoToTimelineCommand { get; }
    public ICommand AddTextToTimelineCommand { get; }
    public ICommand ChangeAspectCommand { get; }

    public EditorViewModel(
        IProjectService projectService,
        ITimelineService timelineService,
        IMediaEngine mediaEngine,
        IPreviewRenderer previewRenderer,
        Action openExportModal)
    {
        _projectService = projectService;
        _timelineService = timelineService;
        _mediaEngine = mediaEngine;
        _previewRenderer = previewRenderer;
        _openExportModal = openExportModal;

        _currentProject = _projectService.CurrentProject;

        PlayPauseCommand = new RelayCommand(TogglePlayPause);
        StepForwardCommand = new RelayCommand(() => Seek(CurrentTime + TimeSpan.FromSeconds(1.0 / 30.0)));
        StepBackwardCommand = new RelayCommand(() => Seek(CurrentTime - TimeSpan.FromSeconds(1.0 / 30.0)));
        SeekCommand = new RelayCommand<TimeSpan>(Seek);
        SplitClipCommand = new RelayCommand(SplitSelectedClip);
        DeleteClipCommand = new RelayCommand(DeleteSelectedClip);
        UndoCommand = new RelayCommand(() => { _timelineService.UndoRedo.Undo(); OnPropertyChanged(nameof(CurrentProject)); });
        RedoCommand = new RelayCommand(() => { _timelineService.UndoRedo.Redo(); OnPropertyChanged(nameof(CurrentProject)); });
        SaveCommand = new AsyncRelayCommand(SaveProjectAsync);
        OpenExportCommand = new RelayCommand(_openExportModal);
        AddPhotoToTimelineCommand = new RelayCommand<string>(AddPhotoToTimeline);
        AddTextToTimelineCommand = new RelayCommand(AddTextOverlayToTimeline);
        ChangeAspectCommand = new RelayCommand<AspectRatio>(ChangeAspectRatio);

        _playbackTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(33) // ~30 fps
        };
        _playbackTimer.Tick += OnPlaybackTick;

        _projectService.ProjectChanged += (s, proj) =>
        {
            CurrentProject = proj;
            CurrentTime = TimeSpan.Zero;
            SelectedClip = null;
            RefreshLibrary();
        };

        RefreshLibrary();
    }

    private void TogglePlayPause()
    {
        IsPlaying = !IsPlaying;
        if (IsPlaying)
        {
            if (CurrentTime >= CurrentProject.Timeline.TotalDuration)
                CurrentTime = TimeSpan.Zero;
            _playbackTimer.Start();
        }
        else
        {
            _playbackTimer.Stop();
        }
    }

    private void OnPlaybackTick(object? sender, EventArgs e)
    {
        if (!IsPlaying) return;

        var nextTime = CurrentTime + TimeSpan.FromMilliseconds(33);
        if (nextTime >= CurrentProject.Timeline.TotalDuration)
        {
            CurrentTime = CurrentProject.Timeline.TotalDuration;
            IsPlaying = false;
            _playbackTimer.Stop();
        }
        else
        {
            CurrentTime = nextTime;
        }
        OnPropertyChanged(nameof(TimecodeDisplay));
    }

    public void Seek(TimeSpan time)
    {
        if (time < TimeSpan.Zero) time = TimeSpan.Zero;
        if (time > CurrentProject.Timeline.TotalDuration) time = CurrentProject.Timeline.TotalDuration;

        CurrentTime = time;
        CurrentProject.Timeline.PlayheadPosition = time;
        OnPropertyChanged(nameof(TimecodeDisplay));
    }

    public void SelectClip(Clip? clip)
    {
        SelectedClip = clip;
    }

    private void SplitSelectedClip()
    {
        if (SelectedClip != null)
        {
            _timelineService.SplitClip(SelectedClip, CurrentTime);
            OnPropertyChanged(nameof(CurrentProject));
        }
    }

    private void DeleteSelectedClip()
    {
        if (SelectedClip != null)
        {
            _timelineService.DeleteClip(SelectedClip);
            SelectedClip = null;
            OnPropertyChanged(nameof(CurrentProject));
        }
    }

    public void AddPhotoToTimeline(string? filePath)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return;

        var videoTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        TimeSpan start = videoTrack.Duration;
        var imageClip = new ImageClip(filePath, TimeSpan.FromSeconds(3.5))
        {
            StartTime = start,
            CropMode = CropMode.BlurBackground,
            Motion = MotionPreset.ZoomIn,
            TransitionOut = new Core.Models.Transitions.Transition(TransitionType.CrossDissolve, TimeSpan.FromSeconds(0.75))
        };

        _timelineService.AddClip(videoTrack, imageClip);
        RefreshLibrary();
        OnPropertyChanged(nameof(CurrentProject));
    }

    public void AddTextOverlayToTimeline()
    {
        var overlayTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Overlay, "Overlay Track");
        var textClip = new TextClip("Add Title", TimeSpan.FromSeconds(3.0))
        {
            StartTime = CurrentTime
        };
        textClip.Transform.AnchorX = 0.5;
        textClip.Transform.AnchorY = 0.85;
        textClip.Overlay.ColorHex = "#FFFFFF";
        textClip.Overlay.BackgroundColorHex = "#99000000";

        _timelineService.AddClip(overlayTrack, textClip);
        SelectedClip = textClip;
        OnPropertyChanged(nameof(CurrentProject));
    }

    public void ChangeAspectRatio(AspectRatio ratio)
    {
        CurrentProject.Canvas.ApplyAspectRatio(ratio);
        _previewRenderer.InvalidateCache();
        OnPropertyChanged(nameof(CurrentProject));
    }

    private async Task SaveProjectAsync()
    {
        if (string.IsNullOrEmpty(_projectService.CurrentFilePath))
        {
            string docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            string path = Path.Combine(docs, $"{CurrentProject.Metadata.Name}.vcproj");
            await _projectService.SaveProjectAsync(path);
        }
        else
        {
            await _projectService.SaveProjectAsync();
        }
    }

    private void RefreshLibrary()
    {
        LibraryAssets.Clear();
        foreach (var asset in CurrentProject.Assets)
        {
            LibraryAssets.Add(asset);
        }
    }
}
