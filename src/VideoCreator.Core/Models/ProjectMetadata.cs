using System;
using System.Collections.Generic;

namespace VideoCreator.Core.Models;

public class ProjectMetadata
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Untitled Project";
    public string Author { get; set; } = Environment.UserName ?? "User";
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ModifiedAt { get; set; } = DateTime.UtcNow;
    public List<string> Tags { get; set; } = new();

    public ProjectMetadata Clone() => new()
    {
        Id = Id,
        Name = Name,
        Author = Author,
        Description = Description,
        CreatedAt = CreatedAt,
        ModifiedAt = ModifiedAt,
        Tags = new List<string>(Tags)
    };
}
