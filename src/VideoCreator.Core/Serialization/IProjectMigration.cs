using VideoCreator.Core.Models;

namespace VideoCreator.Core.Serialization;

public interface IProjectMigration
{
    int FromVersion { get; }
    int ToVersion { get; }
    string MigrateJson(string json);
}
