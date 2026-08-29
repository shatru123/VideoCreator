using System;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Core.Models;

namespace VideoCreator.Rendering.Export;

public interface IExportEngine
{
    Task<bool> ExportAsync(
        Project project,
        ExportOptions options,
        IProgress<ExportProgress>? progress = null,
        CancellationToken ct = default);
}
