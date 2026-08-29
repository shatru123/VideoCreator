using System;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoCreator.Application.AutoCreation;
using VideoCreator.Application.Export;
using VideoCreator.Application.Services;
using VideoCreator.Core.Enums;
using VideoCreator.Infrastructure.Autosave;
using VideoCreator.Media.Audio;
using VideoCreator.Media.Services;
using VideoCreator.Rendering.Export;
using VideoCreator.Rendering.Preview;

namespace VideoCreator.App.ViewModels;

public enum AppScreen
{
    Home,
    QuickCreate,
    Editor
}

public partial class MainViewModel : ViewModelBase
{
    private readonly IProjectService _projectService;
    private readonly ITimelineService _timelineService;
    private readonly IMediaEngine _mediaEngine;
    private readonly IAudioAnalyzer _audioAnalyzer;
    private readonly IPreviewRenderer _previewRenderer;
    private readonly IExportEngine _exportEngine;
    private readonly IExportQueueService _exportQueue;
    private readonly IAutoVideoGenerator _autoVideoGenerator;
    private readonly IAutosaveService _autosaveService;

    [ObservableProperty]
    private AppScreen _currentScreen = AppScreen.Home;

    [ObservableProperty]
    private ViewModelBase? _currentScreenViewModel;

    [ObservableProperty]
    private bool _isExportModalOpen;

    [ObservableProperty]
    private ExportDialogViewModel? _exportDialogViewModel;

    [ObservableProperty]
    private bool _showRecoveryBanner;

    public HomeViewModel HomeVm { get; }
    public QuickCreateViewModel QuickCreateVm { get; }
    public EditorViewModel EditorVm { get; }

    public ICommand NavigateToHomeCommand { get; }
    public ICommand NavigateToQuickCreateCommand { get; }
    public ICommand NavigateToEditorCommand { get; }
    public ICommand CreateNewProjectCommand { get; }
    public ICommand RestoreRecoverySnapshotCommand { get; }
    public ICommand DiscardRecoverySnapshotCommand { get; }

    public MainViewModel()
    {
        // Setup Dependency Injection graph
        _projectService = new ProjectService();
        _timelineService = new TimelineService(_projectService);
        _mediaEngine = new FFmpegMediaEngine();
        _audioAnalyzer = new AudioAnalyzer();
        _previewRenderer = new PreviewRenderer();
        _exportEngine = new FFmpegExportEngine(_previewRenderer);
        _exportQueue = new ExportQueueService(_exportEngine);
        _autoVideoGenerator = new AutoVideoGenerator(_mediaEngine, _audioAnalyzer);
        _autosaveService = new AutosaveService(_projectService);

        // Setup Child ViewModels
        HomeVm = new HomeViewModel(_projectService, () => SwitchScreen(AppScreen.QuickCreate), () => SwitchScreen(AppScreen.Editor));
        QuickCreateVm = new QuickCreateViewModel(_autoVideoGenerator, _projectService, () => SwitchScreen(AppScreen.Editor), () => SwitchScreen(AppScreen.Home));
        EditorVm = new EditorViewModel(_projectService, _timelineService, _mediaEngine, _previewRenderer, OpenExportModal);

        NavigateToHomeCommand = new RelayCommand(() => SwitchScreen(AppScreen.Home));
        NavigateToQuickCreateCommand = new RelayCommand(() => SwitchScreen(AppScreen.QuickCreate));
        NavigateToEditorCommand = new RelayCommand(() => SwitchScreen(AppScreen.Editor));
        CreateNewProjectCommand = new RelayCommand(CreateNewProject);
        RestoreRecoverySnapshotCommand = new AsyncRelayCommand(RestoreRecoverySnapshotAsync);
        DiscardRecoverySnapshotCommand = new AsyncRelayCommand(DiscardRecoverySnapshotAsync);

        SwitchScreen(AppScreen.Home);
        _autosaveService.StartAutosave(TimeSpan.FromSeconds(15));
        CheckForRecoverySnapshot();
    }

    public void CreateNewProject()
    {
        _projectService.CreateNewProject("New Video Story", AspectRatio.Ratio16x9);
        SwitchScreen(AppScreen.Editor);
    }

    public async Task OpenProjectFromFileAsync(string filePath)
    {
        if (string.IsNullOrEmpty(filePath)) return;
        await _projectService.LoadProjectAsync(filePath);
        SwitchScreen(AppScreen.Editor);
    }

    public void SwitchScreen(AppScreen screen)
    {
        CurrentScreen = screen;
        CurrentScreenViewModel = screen switch
        {
            AppScreen.Home => HomeVm,
            AppScreen.QuickCreate => QuickCreateVm,
            AppScreen.Editor => EditorVm,
            _ => HomeVm
        };
    }

    private void OpenExportModal()
    {
        ExportDialogViewModel = new ExportDialogViewModel(_exportQueue, _projectService, () => IsExportModalOpen = false);
        IsExportModalOpen = true;
    }

    private void CheckForRecoverySnapshot()
    {
        Task.Run(async () =>
        {
            bool hasSnapshot = await _autosaveService.HasRecoverySnapshotAsync();
            if (hasSnapshot)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => ShowRecoveryBanner = true);
            }
        });
    }

    private async Task RestoreRecoverySnapshotAsync()
    {
        var project = await _autosaveService.LoadRecoverySnapshotAsync();
        if (project != null)
        {
            _projectService.SetCurrentProject(project);
            SwitchScreen(AppScreen.Editor);
        }
        ShowRecoveryBanner = false;
    }

    private async Task DiscardRecoverySnapshotAsync()
    {
        await _autosaveService.DiscardRecoverySnapshotAsync();
        ShowRecoveryBanner = false;
    }
}
