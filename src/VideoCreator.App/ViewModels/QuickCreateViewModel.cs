using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoCreator.Application.AutoCreation;
using VideoCreator.Application.Services;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Templates;

namespace VideoCreator.App.ViewModels;

public class PhotoItem
{
    public string FilePath { get; set; } = string.Empty;
    public string FileName => Path.GetFileName(FilePath);
}

public partial class QuickCreateViewModel : ViewModelBase
{
    private readonly IAutoVideoGenerator _generator;
    private readonly IProjectService _projectService;
    private readonly Action _navigateToEditor;
    private readonly Action _navigateToHome;

    [ObservableProperty]
    private string _projectName = "My Creation";

    [ObservableProperty]
    private ObservableCollection<PhotoItem> _photos = new();

    [ObservableProperty]
    private string? _musicFilePath;

    [ObservableProperty]
    private string _musicFileName = "No music selected (Click to browse)";

    [ObservableProperty]
    private ObservableCollection<Template> _templates = new();

    [ObservableProperty]
    private Template? _selectedTemplate;

    [ObservableProperty]
    private AspectRatio _selectedAspectRatio = AspectRatio.Ratio9x16;

    [ObservableProperty]
    private TimingMode _selectedTimingMode = TimingMode.Auto;

    [ObservableProperty]
    private bool _isGenerating;

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    public ICommand AddPhotoCommand { get; }
    public ICommand RemovePhotoCommand { get; }
    public ICommand GenerateVideoCommand { get; }
    public ICommand BackToHomeCommand { get; }

    public QuickCreateViewModel(
        IAutoVideoGenerator generator,
        IProjectService projectService,
        Action navigateToEditor,
        Action navigateToHome)
    {
        _generator = generator;
        _projectService = projectService;
        _navigateToEditor = navigateToEditor;
        _navigateToHome = navigateToHome;

        AddPhotoCommand = new RelayCommand<string>(AddPhoto);
        RemovePhotoCommand = new RelayCommand<PhotoItem>(RemovePhoto);
        GenerateVideoCommand = new AsyncRelayCommand(GenerateVideoAsync);
        BackToHomeCommand = new RelayCommand(_navigateToHome);

        foreach (var t in Template.GetBuiltInTemplates())
        {
            Templates.Add(t);
        }
        SelectedTemplate = Templates.FirstOrDefault();
    }

    public void AddPhoto(string? path)
    {
        if (!string.IsNullOrEmpty(path) && File.Exists(path))
        {
            Photos.Add(new PhotoItem { FilePath = path });
        }
    }

    public void RemovePhoto(PhotoItem? item)
    {
        if (item != null) Photos.Remove(item);
    }

    public void SetMusic(string? path)
    {
        MusicFilePath = path;
        MusicFileName = string.IsNullOrEmpty(path) ? "No music selected" : Path.GetFileName(path);
    }

    private async Task GenerateVideoAsync()
    {
        if (Photos.Count == 0)
        {
            StatusMessage = "Please add at least one photo.";
            return;
        }

        IsGenerating = true;
        StatusMessage = "Generating your timeline...";

        try
        {
            var options = new AutoCreationOptions
            {
                ProjectName = ProjectName,
                PhotoFilePaths = Photos.Select(p => p.FilePath).ToList(),
                MusicFilePath = MusicFilePath,
                Template = SelectedTemplate,
                AspectRatio = SelectedAspectRatio,
                TimingMode = SelectedTimingMode
            };

            var project = await _generator.GenerateAsync(options);
            _projectService.SetCurrentProject(project);
            _navigateToEditor();
        }
        catch (Exception ex)
        {
            StatusMessage = $"Generation Error: {ex.Message}";
        }
        finally
        {
            IsGenerating = false;
        }
    }
}
