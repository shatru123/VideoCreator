using System;
using FluentAssertions;
using VideoCreator.Core.Commands;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Effects;
using Xunit;

namespace VideoCreator.Tests.Core;

public class CommandTests
{
    [Fact]
    public void UndoRedoManager_ShouldSupportAddAndUndoClip()
    {
        var manager = new UndoRedoManager();
        var track = new Track("Video", TrackType.Video);
        var clip = new ImageClip("photo.jpg", TimeSpan.FromSeconds(3.0));

        track.Clips.Should().BeEmpty();

        var addCmd = new AddClipCommand(track, clip);
        manager.Execute(addCmd);

        track.Clips.Should().ContainSingle().Which.Should().Be(clip);
        manager.CanUndo.Should().BeTrue();

        manager.Undo();
        track.Clips.Should().BeEmpty();
        manager.CanRedo.Should().BeTrue();

        manager.Redo();
        track.Clips.Should().ContainSingle().Which.Should().Be(clip);
    }

    [Fact]
    public void SplitClipCommand_ShouldSplitClipIntoTwoHalvesAndUndo()
    {
        var manager = new UndoRedoManager();
        var track = new Track("Video", TrackType.Video);
        var clip = new ImageClip("photo.jpg", TimeSpan.FromSeconds(6.0)) { StartTime = TimeSpan.Zero };
        track.Clips.Add(clip);

        var splitCmd = new SplitClipCommand(track, clip, TimeSpan.FromSeconds(2.0));
        manager.Execute(splitCmd);

        track.Clips.Should().HaveCount(2);
        track.Clips[0].Duration.Should().Be(TimeSpan.FromSeconds(2.0));
        track.Clips[1].Duration.Should().Be(TimeSpan.FromSeconds(4.0));
        track.Clips[1].StartTime.Should().Be(TimeSpan.FromSeconds(2.0));

        manager.Undo();
        track.Clips.Should().ContainSingle();
        track.Clips[0].Duration.Should().Be(TimeSpan.FromSeconds(6.0));
    }
}
