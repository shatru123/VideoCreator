using System;
using System.IO;
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

    public event EventHandler<Project>? ProjectChanged;
    public event EventHandler? DirtyStateChanged;

    public ProjectService()
    {
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
        IsDirty = false;
    }

    public void SetCurrentProject(Project project, string? filePath = null)
    {
        _currentProject = project ?? throw new ArgumentNullException(nameof(project));
        _currentFilePath = filePath;
        _isDirty = false;
        ProjectChanged?.Invoke(this, _currentProject);
        DirtyStateChanged?.Invoke(this, EventArgs.Empty);
    }
}
