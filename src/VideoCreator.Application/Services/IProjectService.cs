using System;
using System.Threading.Tasks;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;

namespace VideoCreator.Application.Services;

public interface IProjectService
{
    Project CurrentProject { get; set; }
    string? CurrentFilePath { get; set; }
    bool IsDirty { get; set; }

    event EventHandler<Project>? ProjectChanged;
    event EventHandler? DirtyStateChanged;

    Project CreateNewProject(string name = "Untitled Project", AspectRatio ratio = AspectRatio.Ratio16x9, int fps = 30);
    Task<Project> LoadProjectAsync(string filePath);
    Task SaveProjectAsync(string? filePath = null);
    void SetCurrentProject(Project project, string? filePath = null);
}
