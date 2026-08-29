using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using VideoCreator.Core.Models;

namespace VideoCreator.Core.Serialization;

public class ProjectSerializer
{
    private readonly List<IProjectMigration> _migrations = new();

    public static readonly JsonSerializerOptions DefaultOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters =
        {
            new JsonStringEnumConverter()
        }
    };

    public void RegisterMigration(IProjectMigration migration)
    {
        _migrations.Add(migration);
        _migrations.Sort((a, b) => a.FromVersion.CompareTo(b.FromVersion));
    }

    public string Serialize(Project project)
    {
        project.Metadata.ModifiedAt = DateTime.UtcNow;
        return JsonSerializer.Serialize(project, DefaultOptions);
    }

    public void SerializeToFile(Project project, string filePath)
    {
        string directory = Path.GetDirectoryName(filePath) ?? string.Empty;
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        string json = Serialize(project);
        File.WriteAllText(filePath, json);
    }

    public Project Deserialize(string json)
    {
        // Check schema version
        using var doc = JsonDocument.Parse(json);
        int version = 1;
        if (doc.RootElement.TryGetProperty("schemaVersion", out var versionProp))
        {
            version = versionProp.GetInt32();
        }

        // Apply migrations if needed
        string currentJson = json;
        while (version < Project.CurrentSchemaVersion)
        {
            var migration = _migrations.Find(m => m.FromVersion == version);
            if (migration == null)
            {
                throw new InvalidOperationException($"No migration path found from schema version {version} to {Project.CurrentSchemaVersion}.");
            }
            currentJson = migration.MigrateJson(currentJson);
            version = migration.ToVersion;
        }

        var project = JsonSerializer.Deserialize<Project>(currentJson, DefaultOptions)
            ?? throw new InvalidDataException("Failed to deserialize project JSON.");

        return project;
    }

    public Project DeserializeFromFile(string filePath)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException("Project file not found.", filePath);

        string json = File.ReadAllText(filePath);
        return Deserialize(json);
    }
}
