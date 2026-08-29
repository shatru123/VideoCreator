using System;
using System.Collections.Generic;
using VideoCreator.Core.Enums;

namespace VideoCreator.Core.Models.Effects;

public class Effect
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public EffectType Type { get; set; }
    public double Intensity { get; set; } = 1.0; // 0.0 - 1.0 standard
    public bool IsEnabled { get; set; } = true;
    public Dictionary<string, double> Parameters { get; set; } = new();

    public Effect() { }

    public Effect(EffectType type, double intensity = 1.0)
    {
        Type = type;
        Intensity = intensity;
    }

    public Effect Clone() => new()
    {
        Id = Guid.NewGuid().ToString("N"),
        Type = Type,
        Intensity = Intensity,
        IsEnabled = IsEnabled,
        Parameters = new Dictionary<string, double>(Parameters)
    };
}
