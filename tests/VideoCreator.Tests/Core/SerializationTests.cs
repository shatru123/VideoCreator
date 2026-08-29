using System;
using System.IO;
using FluentAssertions;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Effects;
using VideoCreator.Core.Models.Transitions;
using VideoCreator.Core.Serialization;
using Xunit;

namespace VideoCreator.Tests.Core;

public class SerializationTests
{
    [Fact]
    public void ProjectSerializer_ShouldSerializeAndDeserializeAccurately()
    {
        var serializer = new ProjectSerializer();
        var project = new Project("Vacation Video", AspectRatio.Ratio9x16);
        var videoTrack = project.Timeline.GetOrCreateTrack(TrackType.Video, "Main Video");

        var imageClip = new ImageClip("sample.jpg", TimeSpan.FromSeconds(4.0))
        {
            StartTime = TimeSpan.Zero,
            Motion = MotionPreset.Cinematic,
            CropMode = CropMode.BlurBackground,
            TransitionOut = new Transition(TransitionType.CrossDissolve, TimeSpan.FromSeconds(0.75))
        };
        imageClip.Effects.Add(new Effect(EffectType.Cinematic, 0.8));
        videoTrack.Clips.Add(imageClip);

        var overlayTrack = project.Timeline.GetOrCreateTrack(TrackType.Overlay, "Titles");
        var textClip = new TextClip("Golden Beach", TimeSpan.FromSeconds(3.0))
        {
            StartTime = TimeSpan.FromSeconds(0.5)
        };
        overlayTrack.Clips.Add(textClip);

        // Serialize
        string json = serializer.Serialize(project);
        json.Should().NotBeNullOrWhiteSpace();

        // Deserialize
        var restored = serializer.Deserialize(json);
        restored.Metadata.Name.Should().Be("Vacation Video");
        restored.Canvas.AspectRatio.Should().Be(AspectRatio.Ratio9x16);
        restored.Timeline.Tracks.Should().HaveCount(project.Timeline.Tracks.Count);

        var restoredVideoTrack = restored.Timeline.GetTrackById(videoTrack.Id);
        restoredVideoTrack.Should().NotBeNull();
        restoredVideoTrack!.Clips.Should().HaveCount(1);
        var restoredClip = restoredVideoTrack.Clips[0] as ImageClip;
        restoredClip.Should().NotBeNull();
        restoredClip!.Motion.Should().Be(MotionPreset.Cinematic);
        restoredClip.CropMode.Should().Be(CropMode.BlurBackground);
        restoredClip.TransitionOut!.Type.Should().Be(TransitionType.CrossDissolve);
        restoredClip.Effects.Should().ContainSingle().Which.Type.Should().Be(EffectType.Cinematic);
    }
}
