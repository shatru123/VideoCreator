using System;
using System.Collections.ObjectModel;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Core.Models;
using VideoCreator.Rendering.Export;

namespace VideoCreator.Application.Export;

public enum ExportJobStatus
{
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled
}

public class ExportJob
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ProjectName { get; set; } = string.Empty;
    public string OutputPath { get; set; } = string.Empty;
    public ExportJobStatus Status { get; set; } = ExportJobStatus.Queued;
    public double ProgressPercentage { get; set; } = 0.0;
    public string StatusMessage { get; set; } = "Queued";
    public string? ErrorDetails { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public CancellationTokenSource? Cts { get; set; }
}

public interface IExportQueueService
{
    ObservableCollection<ExportJob> Jobs { get; }
    event EventHandler<ExportJob>? JobStatusChanged;

    Task<ExportJob> EnqueueExportAsync(Project project, ExportOptions options);
    void CancelJob(string jobId);
}
