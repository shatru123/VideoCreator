using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using ICommand = System.Windows.Input.ICommand;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoCreator.Application.Services;
using VideoCreator.Core.Commands;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Effects;
using VideoCreator.Core.Models.Templates;
using VideoCreator.Core.Models.Transitions;
using VideoCreator.Media.Services;
using VideoCreator.Rendering.Preview;

namespace VideoCreator.App.ViewModels;

public class TextPresetItem
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SampleText { get; set; } = string.Empty;
    public string FontFamily { get; set; } = "Arial";
    public double FontSize { get; set; } = 48;
    public string ColorHex { get; set; } = "#FFFFFF";
    public string? BackgroundColorHex { get; set; } = "#99000000";
    public TextAnimation EntryAnimation { get; set; } = TextAnimation.Fade;
}

public partial class EditorViewModel : ViewModelBase
{
    private readonly IProjectService _projectService;
    private readonly ITimelineService _timelineService;
    private readonly IMediaEngine _mediaEngine;
    private readonly IPreviewRenderer _previewRenderer;
    private readonly IAudioPlayerService _audioPlayer;
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

    [ObservableProperty]
    private ObservableCollection<Asset> _audioAssets = new();

    [ObservableProperty]
    private ObservableCollection<string> _availableFontFamilies = new()
    {
        "Arial",
        "Inter",
        "Helvetica",
        "Georgia",
        "Impact",
        "Trebuchet MS",
        "Times New Roman",
        "Courier New",
        "Verdana",
        "Comic Sans MS",
        "Futura",
        "Avenir",
        "Palatino",
        "Optima"
    };

    [ObservableProperty]
    private ObservableCollection<TextPresetItem> _textPresets = new();

    [ObservableProperty]
    private ObservableCollection<Template> _availableTemplates = new();

    [ObservableProperty]
    private ObservableCollection<MotionPreset> _availableMotionPresets = new(Enum.GetValues<MotionPreset>().Where(m => m != MotionPreset.None));

    [ObservableProperty]
    private MotionPreset? _copiedMotionPreset;

    public string TimecodeDisplay => $"{CurrentTime:mm\\:ss\\.ff} / {CurrentProject.Timeline.TotalDuration:mm\\:ss\\.ff}";

    public bool IsImageClipSelected => SelectedClip is ImageClip;
    public bool IsTextClipSelected => SelectedClip is TextClip;
    public bool IsAudioClipSelected => SelectedClip is AudioClip;
    public ImageClip? SelectedImageClip => SelectedClip as ImageClip;
    public TextClip? SelectedTextClip => SelectedClip as TextClip;
    public AudioClip? SelectedAudioClip => SelectedClip as AudioClip;

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
    public ICommand AddMusicToTimelineCommand { get; }
    public ICommand AddTextToTimelineCommand { get; }
    public ICommand InsertTextPresetCommand { get; }
    public ICommand ChangeAspectCommand { get; }
    public ICommand SetActiveTabCommand { get; }
    public ICommand ApplyTemplateCommand { get; }
    public ICommand RemoveAssetCommand { get; }
    public ICommand RotateSelectedClipCommand { get; }
    public ICommand FlipHorizontalSelectedClipCommand { get; }
    public ICommand FlipVerticalSelectedClipCommand { get; }
    public ICommand ResetTransformSelectedClipCommand { get; }
    public ICommand CopyAnimationCommand { get; }
    public ICommand PasteAnimationCommand { get; }
    public ICommand ApplyAnimationToAllCommand { get; }
    public ICommand RandomizeAnimationsCommand { get; }

    public EditorViewModel(
        IProjectService projectService,
        ITimelineService timelineService,
        IMediaEngine mediaEngine,
        IPreviewRenderer previewRenderer,
        Action openExportModal,
        IAudioPlayerService? audioPlayer = null)
    {
        _projectService = projectService;
        _timelineService = timelineService;
        _mediaEngine = mediaEngine;
        _previewRenderer = previewRenderer;
        _openExportModal = openExportModal;
        _audioPlayer = audioPlayer ?? new AudioPlayerService();

        _currentProject = _projectService.CurrentProject;

        PlayPauseCommand = new RelayCommand(TogglePlayPause);
        StepForwardCommand = new RelayCommand(() => Seek(CurrentTime + TimeSpan.FromSeconds(1.0 / 30.0)));
        StepBackwardCommand = new RelayCommand(() => Seek(CurrentTime - TimeSpan.FromSeconds(1.0 / 30.0)));
        SeekCommand = new RelayCommand<TimeSpan>(Seek);
        SplitClipCommand = new RelayCommand(SplitSelectedClip);
        DeleteClipCommand = new RelayCommand(DeleteSelectedClip);
        UndoCommand = new RelayCommand(() => { _timelineService.UndoRedo.Undo(); NotifyAll(); });
        RedoCommand = new RelayCommand(() => { _timelineService.UndoRedo.Redo(); NotifyAll(); });
        SaveCommand = new AsyncRelayCommand(SaveProjectAsync);
        OpenExportCommand = new RelayCommand(_openExportModal);
        AddPhotoToTimelineCommand = new RelayCommand<string>(AddPhotoToTimeline);
        AddMusicToTimelineCommand = new RelayCommand<string>(AddMusicToTimeline);
        AddTextToTimelineCommand = new RelayCommand(AddTextOverlayToTimeline);
        InsertTextPresetCommand = new RelayCommand<TextPresetItem>(InsertTextPreset);
        ChangeAspectCommand = new RelayCommand<AspectRatio>(ChangeAspectRatio);
        SetActiveTabCommand = new RelayCommand<string>(tab => ActiveLibraryTab = tab ?? "Photos");
        ApplyTemplateCommand = new RelayCommand<Template>(ApplyTemplateToProject);
        RemoveAssetCommand = new RelayCommand<Asset>(RemoveAsset);
        RotateSelectedClipCommand = new RelayCommand<string>(dir => RotateSelectedClip(dir == "left" ? -90 : 90));
        FlipHorizontalSelectedClipCommand = new RelayCommand(FlipHorizontalSelectedClip);
        FlipVerticalSelectedClipCommand = new RelayCommand(FlipVerticalSelectedClip);
        ResetTransformSelectedClipCommand = new RelayCommand(ResetTransformSelectedClip);
        CopyAnimationCommand = new RelayCommand(CopyAnimation);
        PasteAnimationCommand = new RelayCommand(PasteAnimation);
        ApplyAnimationToAllCommand = new RelayCommand<MotionPreset?>(ApplyAnimationToAll);
        RandomizeAnimationsCommand = new RelayCommand(RandomizeAnimations);

        _playbackTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(33) // ~30 fps
        };
        _playbackTimer.Tick += OnPlaybackTick;

        _projectService.ProjectChanged += (s, proj) =>
        {
            _audioPlayer.Stop();
            CurrentProject = proj;
            CurrentTime = TimeSpan.Zero;
            SelectedClip = null;
            RefreshLibrary();
            NotifyAll();
        };

        InitTextPresets();
        InitTemplates();
        RefreshLibrary();
    }

    private void InitTextPresets()
    {
        TextPresets.Clear();
        TextPresets.Add(new TextPresetItem
        {
            Title = "Viral Reel Title",
            Description = "Bold punchy title with slide animation",
            SampleText = "WAIT FOR IT ⚡",
            FontFamily = "Impact",
            FontSize = 56,
            ColorHex = "#FFFFFF",
            BackgroundColorHex = "#CC000000",
            EntryAnimation = TextAnimation.Slide
        });
        TextPresets.Add(new TextPresetItem
        {
            Title = "Aesthetic Vlog Subtitle",
            Description = "Warm serif caption with soft background pill",
            SampleText = "golden hour moments ✨",
            FontFamily = "Georgia",
            FontSize = 38,
            ColorHex = "#FFFFFF",
            BackgroundColorHex = "#993B1D5F",
            EntryAnimation = TextAnimation.Fade
        });
        TextPresets.Add(new TextPresetItem
        {
            Title = "Typewriter Story Note",
            Description = "Monospace typewriter character-by-character effect",
            SampleText = "Chapter 1: The Beginning...",
            FontFamily = "Courier New",
            FontSize = 34,
            ColorHex = "#FDE047",
            BackgroundColorHex = "#B3000000",
            EntryAnimation = TextAnimation.Typewriter
        });
        TextPresets.Add(new TextPresetItem
        {
            Title = "Modern Pop Caption",
            Description = "Clean sans-serif popup headline",
            SampleText = "SUMMER 2026 🌴",
            FontFamily = "Inter",
            FontSize = 48,
            ColorHex = "#38BDF8",
            BackgroundColorHex = "#990F172A",
            EntryAnimation = TextAnimation.Pop
        });
        TextPresets.Add(new TextPresetItem
        {
            Title = "Luxury Gold Lower Third",
            Description = "Elegant serif golden title",
            SampleText = "Pure Elegance",
            FontFamily = "Palatino",
            FontSize = 44,
            ColorHex = "#F59E0B",
            BackgroundColorHex = "#9918181B",
            EntryAnimation = TextAnimation.Zoom
        });
    }

    private void InitTemplates()
    {
        AvailableTemplates.Clear();
        foreach (var t in Template.GetBuiltInTemplates())
        {
            AvailableTemplates.Add(t);
        }
    }

    private void TogglePlayPause()
    {
        IsPlaying = !IsPlaying;
        if (IsPlaying)
        {
            if (CurrentTime >= CurrentProject.Timeline.TotalDuration)
                CurrentTime = TimeSpan.Zero;

            StartAudioPlayback();
            _playbackTimer.Start();
        }
        else
        {
            _playbackTimer.Stop();
            _audioPlayer.Stop();
        }
    }

    private void StartAudioPlayback()
    {
        var audioTrack = CurrentProject.Timeline.Tracks.FirstOrDefault(t => t.Type == TrackType.Audio && !t.IsMuted);
        if (audioTrack != null)
        {
            var audioClip = audioTrack.Clips.OfType<AudioClip>().FirstOrDefault(c => CurrentTime >= c.StartTime && CurrentTime < c.EndTime);
            if (audioClip != null)
            {
                TimeSpan offset = CurrentTime - audioClip.StartTime;
                _audioPlayer.Play(audioClip.SourceFilePath, offset, audioClip.AudioSettings.Volume);
            }
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
            _audioPlayer.Stop();
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

        if (IsPlaying)
        {
            StartAudioPlayback();
        }
        else
        {
            _audioPlayer.Stop();
        }
    }

    public void SelectClip(Clip? clip)
    {
        SelectedClip = clip;
        OnPropertyChanged(nameof(IsImageClipSelected));
        OnPropertyChanged(nameof(IsTextClipSelected));
        OnPropertyChanged(nameof(IsAudioClipSelected));
        OnPropertyChanged(nameof(SelectedImageClip));
        OnPropertyChanged(nameof(SelectedTextClip));
        OnPropertyChanged(nameof(SelectedAudioClip));
    }

    private void SplitSelectedClip()
    {
        if (SelectedClip != null)
        {
            _timelineService.SplitClip(SelectedClip, CurrentTime);
            NotifyAll();
        }
    }

    private void DeleteSelectedClip()
    {
        if (SelectedClip != null)
        {
            _timelineService.DeleteClip(SelectedClip);
            SelectedClip = null;
            NotifyAll();
        }
    }

    public void RemoveAsset(Asset? asset)
    {
        if (asset == null) return;

        // Remove from assets list
        CurrentProject.Assets.Remove(asset);

        // Remove clips referencing this asset
        foreach (var track in CurrentProject.Timeline.Tracks)
        {
            var matchingClips = track.Clips.Where(c => (c as ImageClip)?.SourceFilePath == asset.FilePath || (c as AudioClip)?.SourceFilePath == asset.FilePath).ToList();
            foreach (var clip in matchingClips)
            {
                track.Clips.Remove(clip);
            }

            // Compact remaining clips on track
            TimeSpan currentStart = TimeSpan.Zero;
            foreach (var clip in track.Clips)
            {
                clip.StartTime = currentStart;
                currentStart += clip.Duration;
            }
        }

        SelectedClip = null;
        RefreshLibrary();
        NotifyAll();
    }

    public void AddPhotoToTimeline(string? filePath)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return;

        if (!CurrentProject.Assets.Any(a => a.FilePath == filePath))
        {
            CurrentProject.Assets.Add(new Asset
            {
                FilePath = filePath,
                Name = Path.GetFileName(filePath),
                Type = MediaType.Image,
                Duration = TimeSpan.FromSeconds(3.5)
            });
        }

        var videoTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        TimeSpan start = videoTrack.Duration;
        var imageClip = new ImageClip(filePath, TimeSpan.FromSeconds(3.5))
        {
            StartTime = start,
            CropMode = CropMode.BlurBackground,
            Motion = MotionPreset.ZoomIn,
            TransitionOut = new Transition(TransitionType.CrossDissolve, TimeSpan.FromSeconds(0.75))
        };

        _timelineService.AddClip(videoTrack, imageClip);
        SelectClip(imageClip);
        RefreshLibrary();
        NotifyAll();
    }

    public void AddMusicToTimeline(string? filePath)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return;

        Task.Run(async () =>
        {
            var info = await _mediaEngine.InspectAsync(filePath);
            var waveform = await _mediaEngine.GenerateWaveformAsync(filePath, 200);

            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                if (!CurrentProject.Assets.Any(a => a.FilePath == filePath))
                {
                    CurrentProject.Assets.Add(new Asset
                    {
                        FilePath = filePath,
                        Name = Path.GetFileName(filePath),
                        Type = MediaType.Audio,
                        Duration = info.Duration
                    });
                }

                var audioTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Audio, "Audio Track");
                audioTrack.Clips.Clear(); // Replace audio track with new music
                var audioClip = new AudioClip(filePath, info.Duration > TimeSpan.Zero ? info.Duration : TimeSpan.FromSeconds(30))
                {
                    StartTime = TimeSpan.Zero,
                    WaveformData = waveform
                };
                audioClip.AudioSettings.FadeInDuration = TimeSpan.FromSeconds(0.5);
                audioClip.AudioSettings.FadeOutDuration = TimeSpan.FromSeconds(1.5);

                _timelineService.AddClip(audioTrack, audioClip);
                SelectClip(audioClip);
                RefreshLibrary();
                NotifyAll();
            });
        });
    }

    public void AddTextOverlayToTimeline()
    {
        var overlayTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Overlay, "Overlay Track");
        var textClip = new TextClip("Your Title Here", TimeSpan.FromSeconds(3.0))
        {
            StartTime = CurrentTime
        };
        textClip.Transform.AnchorX = 0.5;
        textClip.Transform.AnchorY = 0.85;
        textClip.Overlay.FontFamily = "Inter";
        textClip.Overlay.FontSize = 48;
        textClip.Overlay.ColorHex = "#FFFFFF";
        textClip.Overlay.BackgroundColorHex = "#99000000";
        textClip.Overlay.EntryAnimation = TextAnimation.Slide;

        _timelineService.AddClip(overlayTrack, textClip);
        SelectClip(textClip);
        NotifyAll();
    }

    public void InsertTextPreset(TextPresetItem? preset)
    {
        if (preset == null) return;

        var overlayTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Overlay, "Overlay Track");
        var textClip = new TextClip(preset.SampleText, TimeSpan.FromSeconds(3.0))
        {
            StartTime = CurrentTime
        };
        textClip.Transform.AnchorX = 0.5;
        textClip.Transform.AnchorY = 0.85;
        textClip.Overlay.FontFamily = preset.FontFamily;
        textClip.Overlay.FontSize = preset.FontSize;
        textClip.Overlay.ColorHex = preset.ColorHex;
        textClip.Overlay.BackgroundColorHex = preset.BackgroundColorHex;
        textClip.Overlay.EntryAnimation = preset.EntryAnimation;

        _timelineService.AddClip(overlayTrack, textClip);
        SelectClip(textClip);
        NotifyAll();
    }

    public void ApplyTemplateToProject(Template? template)
    {
        if (template == null) return;

        var videoTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        foreach (var clip in videoTrack.Clips.OfType<ImageClip>())
        {
            clip.CropMode = template.CropMode;
            clip.Motion = template.DefaultMotion;
            if (template.DefaultTransition != TransitionType.None)
            {
                clip.TransitionOut = new Transition(template.DefaultTransition, TimeSpan.FromSeconds(template.TransitionDurationSeconds));
            }
            clip.Effects.Clear();
            foreach (var eff in template.DefaultEffects)
            {
                clip.Effects.Add(eff.Clone());
            }
        }

        CurrentProject.Canvas.ApplyAspectRatio(template.RecommendedAspectRatio);
        _previewRenderer.InvalidateCache();
        NotifyAll();
    }

    public void RotateSelectedClip(double deltaDegrees)
    {
        if (SelectedClip != null)
        {
            SelectedClip.Transform.RotationDegrees = (SelectedClip.Transform.RotationDegrees + deltaDegrees) % 360.0;
            if (SelectedClip.Transform.RotationDegrees < -180.0) SelectedClip.Transform.RotationDegrees += 360.0;
            if (SelectedClip.Transform.RotationDegrees > 180.0) SelectedClip.Transform.RotationDegrees -= 360.0;
            NotifyAll();
        }
    }

    public void FlipHorizontalSelectedClip()
    {
        if (SelectedClip != null)
        {
            SelectedClip.Transform.ToggleFlipX();
            NotifyAll();
        }
    }

    public void FlipVerticalSelectedClip()
    {
        if (SelectedClip != null)
        {
            SelectedClip.Transform.ToggleFlipY();
            NotifyAll();
        }
    }

    public void ResetTransformSelectedClip()
    {
        if (SelectedClip != null)
        {
            SelectedClip.Transform.RotationDegrees = 0.0;
            SelectedClip.Transform.FlipX = false;
            SelectedClip.Transform.FlipY = false;
            SelectedClip.Transform.ScaleX = 1.0;
            SelectedClip.Transform.ScaleY = 1.0;
            SelectedClip.Transform.PositionX = 0.0;
            SelectedClip.Transform.PositionY = 0.0;
            SelectedClip.Transform.Opacity = 1.0;
            NotifyAll();
        }
    }

    public void ChangeAspectRatio(AspectRatio ratio)
    {
        CurrentProject.Canvas.ApplyAspectRatio(ratio);
        _previewRenderer.InvalidateCache();
        NotifyAll();
    }

    public void RemovePhotoFromTimeline(Asset? asset)
    {
        if (asset == null) return;
        var videoTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        var toRemove = videoTrack.Clips.OfType<ImageClip>().Where(c => c.SourceFilePath == asset.FilePath).ToList();
        foreach (var c in toRemove)
        {
            videoTrack.Clips.Remove(c);
        }

        // Compact remaining
        TimeSpan currentStart = TimeSpan.Zero;
        foreach (var clip in videoTrack.Clips)
        {
            clip.StartTime = currentStart;
            currentStart += clip.Duration;
        }

        if (SelectedClip != null && toRemove.Contains(SelectedClip))
        {
            SelectedClip = null;
        }

        _previewRenderer.InvalidateCache();
        NotifyAll();
    }

    public void CopyAnimation()
    {
        if (SelectedImageClip != null)
        {
            CopiedMotionPreset = SelectedImageClip.Motion;
        }
    }

    public void PasteAnimation()
    {
        if (SelectedImageClip != null && CopiedMotionPreset.HasValue)
        {
            _timelineService.UndoRedo.Execute(new ApplyAnimationCommand(SelectedImageClip, CopiedMotionPreset.Value));
            _previewRenderer.InvalidateCache();
            NotifyAll();
        }
    }

    public void ApplyAnimationToAll(MotionPreset? preset = null)
    {
        var targetPreset = preset ?? SelectedImageClip?.Motion ?? MotionPreset.KenBurns;
        var videoTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        var changes = videoTrack.Clips.OfType<ImageClip>().Select(c => (c, targetPreset)).ToList();
        if (changes.Count > 0)
        {
            _timelineService.UndoRedo.Execute(new ApplyAnimationCommand(changes));
            _previewRenderer.InvalidateCache();
            NotifyAll();
        }
    }

    public void RandomizeAnimations()
    {
        var videoTrack = CurrentProject.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        var presets = AvailableMotionPresets.Where(p => p != MotionPreset.None).ToArray();
        if (presets.Length == 0) return;

        var rand = new Random();
        var changes = new List<(ImageClip, MotionPreset)>();
        foreach (var clip in videoTrack.Clips.OfType<ImageClip>())
        {
            var chosen = presets[rand.Next(presets.Length)];
            changes.Add((clip, chosen));
        }

        if (changes.Count > 0)
        {
            _timelineService.UndoRedo.Execute(new ApplyAnimationCommand(changes));
            _previewRenderer.InvalidateCache();
            NotifyAll();
        }
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

    public void RefreshLibrary()
    {
        LibraryAssets.Clear();
        AudioAssets.Clear();

        foreach (var asset in CurrentProject.Assets)
        {
            if (asset.Type == MediaType.Image)
            {
                LibraryAssets.Add(asset);
            }
            else if (asset.Type == MediaType.Audio)
            {
                AudioAssets.Add(asset);
            }
        }
    }

    public void NotifyAll()
    {
        OnPropertyChanged(nameof(CurrentProject));
        OnPropertyChanged(nameof(TimecodeDisplay));
        OnPropertyChanged(nameof(IsImageClipSelected));
        OnPropertyChanged(nameof(IsTextClipSelected));
        OnPropertyChanged(nameof(IsAudioClipSelected));
        OnPropertyChanged(nameof(SelectedImageClip));
        OnPropertyChanged(nameof(SelectedTextClip));
        OnPropertyChanged(nameof(SelectedAudioClip));
        _previewRenderer.InvalidateCache();
    }
}
