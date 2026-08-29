using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoCreator.Application.Services;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Templates;

namespace VideoCreator.App.ViewModels;

public class RecentProjectItem
{
    public string Name { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public AspectRatio AspectRatio { get; set; } = AspectRatio.Ratio16x9;
    public DateTime LastModified { get; set; } = DateTime.UtcNow;
    public string FormattedDate => LastModified.ToString("MMM dd, yyyy");
}

public partial class HomeViewModel : ViewModelBase
{
    private readonly IProjectService _projectService;
    private readonly Action _navigateToQuickCreate;
    private readonly Action _navigateToEditor;

    [ObservableProperty]
    private ObservableCollection<RecentProjectItem> _recentProjects = new();

    [ObservableProperty]
    private ObservableCollection<Template> _featuredTemplates = new();

    public ICommand CreateNewProjectCommand { get; }
    public ICommand StartQuickCreateCommand { get; }
    public ICommand OpenRecentProjectCommand { get; }

    public HomeViewModel(IProjectService projectService, Action navigateToQuickCreate, Action navigateToEditor)
    {
        _projectService = projectService;
        _navigateToQuickCreate = navigateToQuickCreate;
        _navigateToEditor = navigateToEditor;

        CreateNewProjectCommand = new RelayCommand(CreateNewProject);
        StartQuickCreateCommand = new RelayCommand(_navigateToQuickCreate);
        OpenRecentProjectCommand = new RelayCommand<RecentProjectItem>(OpenRecentProject);

        _projectService.RecentProjectsChanged += (s, e) => LoadRecentProjects();

        LoadTemplates();
        LoadRecentProjects();
    }

    private void CreateNewProject()
    {
        _projectService.CreateNewProject("My Video Story", AspectRatio.Ratio16x9);
        _navigateToEditor();
    }

    public void OpenRecentProject(RecentProjectItem? item)
    {
        if (item == null || string.IsNullOrEmpty(item.FilePath)) return;

        if (File.Exists(item.FilePath))
        {
            _projectService.LoadProjectAsync(item.FilePath).ContinueWith(t =>
            {
                if (t.IsCompletedSuccessfully)
                {
                    Avalonia.Threading.Dispatcher.UIThread.Post(_navigateToEditor);
                }
            });
        }
        else
        {
            // If dummy demo item, initialize new project with that name
            _projectService.CreateNewProject(item.Name, item.AspectRatio);
            _navigateToEditor();
        }
    }

    private void LoadTemplates()
    {
        FeaturedTemplates.Clear();
        foreach (var t in Template.GetBuiltInTemplates())
        {
            FeaturedTemplates.Add(t);
        }
    }

    public void LoadRecentProjects()
    {
        RecentProjects.Clear();

        foreach (var path in _projectService.RecentProjects)
        {
            if (File.Exists(path))
            {
                var fi = new FileInfo(path);
                RecentProjects.Add(new RecentProjectItem
                {
                    Name = Path.GetFileNameWithoutExtension(path),
                    FilePath = path,
                    LastModified = fi.LastWriteTimeUtc
                });
            }
        }

        if (RecentProjects.Count == 0)
        {
            RecentProjects.Add(new RecentProjectItem
            {
                Name = "Cinematic Vacation 2026",
                FilePath = "",
                AspectRatio = AspectRatio.Ratio16x9,
                LastModified = DateTime.UtcNow.AddDays(-1)
            });
            RecentProjects.Add(new RecentProjectItem
            {
                Name = "Viral Reel Highlights",
                FilePath = "",
                AspectRatio = AspectRatio.Ratio9x16,
                LastModified = DateTime.UtcNow.AddDays(-3)
            });
        }
    }
}
