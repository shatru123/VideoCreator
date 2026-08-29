using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Application.Services;
using VideoCreator.Core.Models;
using VideoCreator.Core.Serialization;

namespace VideoCreator.Infrastructure.Autosave;

public interface IAutosaveService
{
    string AutosaveFilePath { get; }
    void StartAutosave(TimeSpan interval);
    void StopAutosave();
    Task<bool> HasRecoverySnapshotAsync();
    Task<Project?> LoadRecoverySnapshotAsync();
    Task DiscardRecoverySnapshotAsync();
}

public class AutosaveService : IAutosaveService, IDisposable
{
    private readonly IProjectService _projectService;
    private readonly ProjectSerializer _serializer = new();
    private Timer? _timer;
    private readonly string _autosaveDir;

    public string AutosaveFilePath => Path.Combine(_autosaveDir, "recovery_snapshot.vcproj");

    public AutosaveService(IProjectService projectService, string? customDir = null)
    {
        _projectService = projectService;
        _autosaveDir = customDir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VideoCreator", "Autosave");
        if (!Directory.Exists(_autosaveDir)) Directory.CreateDirectory(_autosaveDir);
    }

    public void StartAutosave(TimeSpan interval)
    {
        _timer?.Dispose();
        _timer = new Timer(async _ => await PerformAutosaveAsync(), null, interval, interval);
    }

    public void StopAutosave()
    {
        _timer?.Dispose();
        _timer = null;
    }

    private async Task PerformAutosaveAsync()
    {
        if (!_projectService.IsDirty) return;

        try
        {
            string json = _serializer.Serialize(_projectService.CurrentProject);
            await File.WriteAllTextAsync(AutosaveFilePath, json);
        }
        catch { }
    }

    public Task<bool> HasRecoverySnapshotAsync()
    {
        return Task.FromResult(File.Exists(AutosaveFilePath) && new FileInfo(AutosaveFilePath).Length > 0);
    }

    public async Task<Project?> LoadRecoverySnapshotAsync()
    {
        if (!File.Exists(AutosaveFilePath)) return null;

        try
        {
            string json = await File.ReadAllTextAsync(AutosaveFilePath);
            return _serializer.Deserialize(json);
        }
        catch
        {
            return null;
        }
    }

    public Task DiscardRecoverySnapshotAsync()
    {
        try
        {
            if (File.Exists(AutosaveFilePath)) File.Delete(AutosaveFilePath);
        }
        catch { }
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _timer?.Dispose();
    }
}
