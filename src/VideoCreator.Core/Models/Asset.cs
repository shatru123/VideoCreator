using System;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models;

public class Asset
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public MediaType Type { get; set; } = MediaType.Image;
    public TimeSpan Duration { get; set; } = TimeSpan.Zero;
    public int Width { get; set; } = 0;
    public int Height { get; set; } = 0;
    public long FileSizeBytes { get; set; } = 0;
    public string? ThumbnailPath { get; set; }
    public DateTime ImportedAt { get; set; } = DateTime.UtcNow;

    public Asset Clone() => new()
    {
        Id = Id,
        Name = Name,
        FilePath = FilePath,
        Type = Type,
        Duration = Duration,
        Width = Width,
        Height = Height,
        FileSizeBytes = FileSizeBytes,
        ThumbnailPath = ThumbnailPath,
        ImportedAt = ImportedAt
    };
}
