using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoCreator.Application.Export;
using VideoCreator.Application.Services;
using VideoCreator.Core.Enums;
using VideoCreator.Rendering.Export;

namespace VideoCreator.App.ViewModels;

public partial class ExportDialogViewModel : ViewModelBase
{
    private readonly IExportQueueService _exportQueue;
    private readonly IProjectService _projectService;
    private readonly Action _closeDialog;

    [ObservableProperty]
    private string _outputPath = string.Empty;

    [ObservableProperty]
    private int _resolution = 1080;

    [ObservableProperty]
    private int _fps = 30;

    [ObservableProperty]
    private ExportPreset _preset = ExportPreset.HighQuality;

    [ObservableProperty]
    private bool _isExporting;

    [ObservableProperty]
    private double _progressPercentage;

    [ObservableProperty]
    private string _statusMessage = "Ready to export";

    [ObservableProperty]
    private bool _isComplete;

    public ICommand StartExportCommand { get; }
    public ICommand CancelExportCommand { get; }
    public ICommand CloseDialogCommand { get; }
    public ICommand OpenOutputFolderCommand { get; }

    public ExportDialogViewModel(IExportQueueService exportQueue, IProjectService projectService, Action closeDialog)
    {
        _exportQueue = exportQueue;
        _projectService = projectService;
        _closeDialog = closeDialog;

        string videosFolder = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        if (string.IsNullOrEmpty(videosFolder) || !Directory.Exists(videosFolder))
        {
            videosFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Movies");
            if (!Directory.Exists(videosFolder)) videosFolder = Directory.GetCurrentDirectory();
        }

        string safeName = string.Join("_", _projectService.CurrentProject.Metadata.Name.Split(Path.GetInvalidFileNameChars()));
        OutputPath = Path.Combine(videosFolder, $"{safeName}.mp4");

        StartExportCommand = new AsyncRelayCommand(StartExportAsync);
        CancelExportCommand = new RelayCommand(CancelExport);
        CloseDialogCommand = new RelayCommand(_closeDialog);
        OpenOutputFolderCommand = new RelayCommand(OpenOutputFolder);
    }

    private async Task StartExportAsync()
    {
        IsExporting = true;
        IsComplete = false;
        ProgressPercentage = 0;
        StatusMessage = "Starting Export...";

        var project = _projectService.CurrentProject;
        var (w, h) = project.Canvas.AspectRatio.GetDefaultDimensions(Resolution);

        var options = new ExportOptions
        {
            OutputPath = OutputPath,
            Width = w,
            Height = h,
            Fps = Fps,
            Preset = Preset
        };

        var job = await _exportQueue.EnqueueExportAsync(project, options);

        _exportQueue.JobStatusChanged += (s, updatedJob) =>
        {
            if (updatedJob.Id == job.Id)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    ProgressPercentage = updatedJob.ProgressPercentage;
                    StatusMessage = updatedJob.StatusMessage;

                    if (updatedJob.Status == ExportJobStatus.Completed)
                    {
                        IsExporting = false;
                        IsComplete = true;
                    }
                    else if (updatedJob.Status == ExportJobStatus.Failed || updatedJob.Status == ExportJobStatus.Cancelled)
                    {
                        IsExporting = false;
                    }
                });
            }
        };
    }

    private void CancelExport()
    {
        _closeDialog();
    }

    private void OpenOutputFolder()
    {
        try
        {
            string dir = Path.GetDirectoryName(OutputPath) ?? string.Empty;
            if (Directory.Exists(dir))
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = dir,
                    UseShellExecute = true
                });
            }
        }
        catch { }
    }
}
