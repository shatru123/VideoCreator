using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Serialization;

namespace VideoCreator.Application.Services;

public class ProjectService : IProjectService
{
    private readonly ProjectSerializer _serializer = new();
    private Project _currentProject;
    private string? _currentFilePath;
    private bool _isDirty;
    private readonly List<string> _recentProjects = new();
    private readonly string _recentProjectsConfigPath;

    public Project CurrentProject
    {
        get => _currentProject;
        set => SetCurrentProject(value, _currentFilePath);
    }

    public string? CurrentFilePath
    {
        get => _currentFilePath;
        set
        {
            _currentFilePath = value;
            DirtyStateChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public bool IsDirty
    {
        get => _isDirty;
        set
        {
            if (_isDirty != value)
            {
                _isDirty = value;
                DirtyStateChanged?.Invoke(this, EventArgs.Empty);
            }
        }
    }

    public IReadOnlyList<string> RecentProjects => _recentProjects.AsReadOnly();

    public event EventHandler<Project>? ProjectChanged;
    public event EventHandler? DirtyStateChanged;
    public event EventHandler? RecentProjectsChanged;

    public ProjectService()
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string configDir = Path.Combine(appData, "VideoCreator");
        Directory.CreateDirectory(configDir);
        _recentProjectsConfigPath = Path.Combine(configDir, "recent_projects.json");

        LoadRecentProjectsConfig();
        _currentProject = CreateNewProject();
    }

    public Project CreateNewProject(string name = "Untitled Project", AspectRatio ratio = AspectRatio.Ratio16x9, int fps = 30)
    {
        var project = new Project(name, ratio, fps);
        SetCurrentProject(project, null);
        IsDirty = false;
        return project;
    }

    public async Task<Project> LoadProjectAsync(string filePath)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException("Project file not found.", filePath);

        string json = await File.ReadAllTextAsync(filePath);
        var project = _serializer.Deserialize(json);
        SetCurrentProject(project, filePath);
        AddRecentProject(filePath);
        IsDirty = false;
        return project;
    }

    public async Task SaveProjectAsync(string? filePath = null)
    {
        string targetPath = filePath ?? _currentFilePath ?? throw new InvalidOperationException("No file path specified for saving project.");
        string json = _serializer.Serialize(_currentProject);

        string dir = Path.GetDirectoryName(targetPath) ?? string.Empty;
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        await File.WriteAllTextAsync(targetPath, json);
        _currentFilePath = targetPath;
        AddRecentProject(targetPath);
        IsDirty = false;
    }

    public void SetCurrentProject(Project project, string? filePath = null)
    {
        _currentProject = project ?? throw new ArgumentNullException(nameof(project));
        _currentFilePath = filePath;
        _isDirty = false;
        if (!string.IsNullOrEmpty(filePath))
        {
            AddRecentProject(filePath);
        }
        ProjectChanged?.Invoke(this, _currentProject);
        DirtyStateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void AddRecentProject(string filePath)
    {
        if (string.IsNullOrEmpty(filePath)) return;

        _recentProjects.Remove(filePath);
        _recentProjects.Insert(0, filePath);

        if (_recentProjects.Count > 10)
        {
            _recentProjects.RemoveAt(_recentProjects.Count - 1);
        }

        SaveRecentProjectsConfig();
        RecentProjectsChanged?.Invoke(this, EventArgs.Empty);
    }

    private void LoadRecentProjectsConfig()
    {
        try
        {
            if (File.Exists(_recentProjectsConfigPath))
            {
                string json = File.ReadAllText(_recentProjectsConfigPath);
                var items = JsonSerializer.Deserialize<List<string>>(json);
                if (items != null)
                {
                    _recentProjects.Clear();
                    _recentProjects.AddRange(items.Where(File.Exists));
                }
            }
        }
        catch { }
    }

    private void SaveRecentProjectsConfig()
    {
        try
        {
            string json = JsonSerializer.Serialize(_recentProjects);
            File.WriteAllText(_recentProjectsConfigPath, json);
        }
        catch { }
    }
}
