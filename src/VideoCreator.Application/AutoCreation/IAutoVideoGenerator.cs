using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Core.Models;

namespace VideoCreator.Application.AutoCreation;

public interface IAutoVideoGenerator
{
    Task<Project> GenerateAsync(AutoCreationOptions options, CancellationToken ct = default);
}
