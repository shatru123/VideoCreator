using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using VideoCreator.Application.AutoCreation;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Templates;
using VideoCreator.Media.Audio;
using VideoCreator.Media.Services;
using Xunit;

namespace VideoCreator.Tests.Application;

public class AutoVideoGeneratorTests
{
    [Fact]
    public async Task AutoVideoGenerator_ShouldGenerateFullTimelineForPhotos()
    {
        var mediaEngine = new FFmpegMediaEngine();
        var audioAnalyzer = new AudioAnalyzer();
        var generator = new AutoVideoGenerator(mediaEngine, audioAnalyzer);

        // Prepare dummy photo list
        var photos = new List<string>();
        for (int i = 0; i < 5; i++)
        {
            string p = Path.Combine(Path.GetTempPath(), $"test_photo_{i}.jpg");
            File.WriteAllText(p, "fake-image");
            photos.Add(p);
        }

        var template = Template.GetBuiltInTemplates().First(t => t.Id == "template-cinematic");

        var options = new AutoCreationOptions
        {
            ProjectName = "Summer Story",
            PhotoFilePaths = photos,
            Template = template,
            AspectRatio = AspectRatio.Ratio9x16,
            TimingMode = TimingMode.Equal,
            TargetPhotoDurationSeconds = 3.0,
            AddTitleOverlay = true,
            CustomTitle = "Summer Memories"
        };

        var project = await generator.GenerateAsync(options);

        project.Metadata.Name.Should().Be("Summer Story");
        project.Canvas.AspectRatio.Should().Be(AspectRatio.Ratio9x16);
        project.Canvas.Width.Should().Be(1080);
        project.Canvas.Height.Should().Be(1920);

        var videoTrack = project.Timeline.Tracks.First(t => t.Type == TrackType.Video);
        videoTrack.Clips.Should().HaveCount(5);
        videoTrack.Duration.Should().Be(TimeSpan.FromSeconds(15.0));

        var overlayTrack = project.Timeline.Tracks.First(t => t.Type == TrackType.Overlay);
        overlayTrack.Clips.Should().ContainSingle();
        var titleClip = overlayTrack.Clips[0] as TextClip;
        titleClip.Should().NotBeNull();
        titleClip!.Overlay.Text.Should().Be("Summer Memories");

        // Clean up temp files
        foreach (var p in photos) File.Delete(p);
    }
}
