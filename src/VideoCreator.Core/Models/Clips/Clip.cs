using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;
using VideoCreator.Core.Models.Effects;
using VideoCreator.Core.Models.Keyframes;
using VideoCreator.Core.Models.Transitions;

namespace VideoCreator.Core.Models.Clips;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "$type")]
[JsonDerivedType(typeof(ImageClip), typeDiscriminator: "image")]
[JsonDerivedType(typeof(VideoClip), typeDiscriminator: "video")]
[JsonDerivedType(typeof(AudioClip), typeDiscriminator: "audio")]
[JsonDerivedType(typeof(TextClip), typeDiscriminator: "text")]
[JsonDerivedType(typeof(ShapeClip), typeDiscriminator: "shape")]
[JsonDerivedType(typeof(StickerClip), typeDiscriminator: "sticker")]
public abstract class Clip
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Clip";
    public string TrackId { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; } = TimeSpan.Zero;
    public TimeSpan Duration { get; set; } = TimeSpan.FromSeconds(3.0);
    public TimeSpan SourceStartTime { get; set; } = TimeSpan.Zero;
    public TimeSpan EndTime => StartTime + Duration;

    public Transform Transform { get; set; } = new();
    public List<Effect> Effects { get; set; } = new();
    public List<KeyframeTrack> KeyframeTracks { get; set; } = new();

    public Transition? TransitionIn { get; set; }
    public Transition? TransitionOut { get; set; }

    public abstract Clip Clone();

    protected void CopyBasePropertiesTo(Clip destination)
    {
        destination.Id = Guid.NewGuid().ToString("N");
        destination.Name = Name;
        destination.TrackId = TrackId;
        destination.StartTime = StartTime;
        destination.Duration = Duration;
        destination.SourceStartTime = SourceStartTime;
        destination.Transform = Transform.Clone();
        destination.Effects = Effects.Select(e => e.Clone()).ToList();
        destination.KeyframeTracks = KeyframeTracks.Select(k => k.Clone()).ToList();
        destination.TransitionIn = TransitionIn?.Clone();
        destination.TransitionOut = TransitionOut?.Clone();
    }
}
