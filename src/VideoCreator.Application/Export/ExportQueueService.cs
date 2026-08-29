using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Core.Models;
using VideoCreator.Rendering.Export;

namespace VideoCreator.Application.Export;

public class ExportQueueService : IExportQueueService
{
    private readonly IExportEngine _exportEngine;

    public ObservableCollection<ExportJob> Jobs { get; } = new();
    public event EventHandler<ExportJob>? JobStatusChanged;

    public ExportQueueService(IExportEngine exportEngine)
    {
        _exportEngine = exportEngine;
    }

    public Task<ExportJob> EnqueueExportAsync(Project project, ExportOptions options)
    {
        var job = new ExportJob
        {
            ProjectName = project.Metadata.Name,
            OutputPath = options.OutputPath,
            Status = ExportJobStatus.Queued,
            Cts = new CancellationTokenSource()
        };

        Jobs.Insert(0, job);
        JobStatusChanged?.Invoke(this, job);

        // Run background export
        _ = Task.Run(async () =>
        {
            job.Status = ExportJobStatus.Processing;
            job.StatusMessage = "Rendering...";
            JobStatusChanged?.Invoke(this, job);

            var progress = new Progress<ExportProgress>(p =>
            {
                job.ProgressPercentage = p.Percentage;
                job.StatusMessage = $"{p.Stage} ({p.CurrentFrame}/{p.TotalFrames})";
                JobStatusChanged?.Invoke(this, job);
            });

            try
            {
                bool success = await _exportEngine.ExportAsync(project, options, progress, job.Cts.Token);
                if (success)
                {
                    job.Status = ExportJobStatus.Completed;
                    job.StatusMessage = "Export Complete!";
                    job.ProgressPercentage = 100.0;
                    job.CompletedAt = DateTime.UtcNow;
                }
                else
                {
                    job.Status = ExportJobStatus.Failed;
                    job.StatusMessage = "Export failed to produce valid output.";
                }
            }
            catch (OperationCanceledException)
            {
                job.Status = ExportJobStatus.Cancelled;
                job.StatusMessage = "Export Cancelled";
            }
            catch (Exception ex)
            {
                job.Status = ExportJobStatus.Failed;
                job.StatusMessage = "Export Failed";
                job.ErrorDetails = ex.Message;
            }
            finally
            {
                JobStatusChanged?.Invoke(this, job);
            }
        });

        return Task.FromResult(job);
    }

    public void CancelJob(string jobId)
    {
        var job = Jobs.FirstOrDefault(j => j.Id == jobId);
        job?.Cts?.Cancel();
    }
}
