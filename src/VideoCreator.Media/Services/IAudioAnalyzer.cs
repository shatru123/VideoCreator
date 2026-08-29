using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Media.Models;

namespace VideoCreator.Media.Services;

public interface IAudioAnalyzer
{
    Task<AudioAnalysisResult> AnalyzeAsync(string audioFilePath, CancellationToken ct = default);
}
