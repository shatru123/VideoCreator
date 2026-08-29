using System;
using System.Linq;
using FluentAssertions;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using Xunit;

namespace VideoCreator.Tests.Core;

public class TimelineTests
{
    [Fact]
    public void Timeline_ShouldCalculateTotalDurationCorrectly()
    {
        var project = new Project("Test Project", AspectRatio.Ratio16x9);
        var track1 = project.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        var track2 = project.Timeline.GetOrCreateTrack(TrackType.Audio, "Audio Track");

        var clip1 = new ImageClip("photo1.jpg", TimeSpan.FromSeconds(3.0)) { StartTime = TimeSpan.Zero };
        var clip2 = new ImageClip("photo2.jpg", TimeSpan.FromSeconds(4.0)) { StartTime = TimeSpan.FromSeconds(3.0) };
        track1.Clips.Add(clip1);
        track1.Clips.Add(clip2);

        var audioClip = new AudioClip("audio.mp3", TimeSpan.FromSeconds(10.0)) { StartTime = TimeSpan.Zero };
        track2.Clips.Add(audioClip);

        project.Timeline.TotalDuration.Should().Be(TimeSpan.FromSeconds(10.0));
        track1.Duration.Should().Be(TimeSpan.FromSeconds(7.0));
    }

    [Fact]
    public void Timeline_GetClipsAt_ShouldReturnActiveClipsAtGivenTimestamp()
    {
        var project = new Project("Test Project", AspectRatio.Ratio16x9);
        var videoTrack = project.Timeline.GetOrCreateTrack(TrackType.Video, "Video Track");
        var overlayTrack = project.Timeline.GetOrCreateTrack(TrackType.Overlay, "Overlay Track");

        var clip1 = new ImageClip("photo1.jpg", TimeSpan.FromSeconds(4.0)) { StartTime = TimeSpan.Zero };
        var clip2 = new ImageClip("photo2.jpg", TimeSpan.FromSeconds(4.0)) { StartTime = TimeSpan.FromSeconds(4.0) };
        videoTrack.Clips.Add(clip1);
        videoTrack.Clips.Add(clip2);

        var textClip = new TextClip("Title", TimeSpan.FromSeconds(2.0)) { StartTime = TimeSpan.FromSeconds(1.0) };
        overlayTrack.Clips.Add(textClip);

        var clipsAt2s = project.Timeline.GetClipsAt(TimeSpan.FromSeconds(2.0));
        clipsAt2s.Should().HaveCount(2);
        clipsAt2s.Should().Contain(clip1);
        clipsAt2s.Should().Contain(textClip);

        var clipsAt5s = project.Timeline.GetClipsAt(TimeSpan.FromSeconds(5.0));
        clipsAt5s.Should().HaveCount(1);
        clipsAt5s.Should().Contain(clip2);
    }
}
