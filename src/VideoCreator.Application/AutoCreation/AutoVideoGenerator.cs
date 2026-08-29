using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using VideoCreator.Core.Enums;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Templates;
using VideoCreator.Core.Models.Transitions;
using VideoCreator.Media.Models;
using VideoCreator.Media.Services;

namespace VideoCreator.Application.AutoCreation;

public class AutoVideoGenerator : IAutoVideoGenerator
{
    private readonly IMediaEngine _mediaEngine;
    private readonly IAudioAnalyzer _audioAnalyzer;

    public AutoVideoGenerator(IMediaEngine mediaEngine, IAudioAnalyzer audioAnalyzer)
    {
        _mediaEngine = mediaEngine;
        _audioAnalyzer = audioAnalyzer;
    }

    public async Task<Project> GenerateAsync(AutoCreationOptions options, CancellationToken ct = default)
    {
        if (options.PhotoFilePaths == null || options.PhotoFilePaths.Count == 0)
            throw new ArgumentException("At least one photo must be provided.", nameof(options));

        var template = options.Template ?? Template.GetBuiltInTemplates().First();
        var project = new Project(options.ProjectName, options.AspectRatio);

        var videoTrack = project.Timeline.GetOrCreateTrack(TrackType.Video, "Main Photos");
        var overlayTrack = project.Timeline.GetOrCreateTrack(TrackType.Overlay, "Titles & Text");
        var audioTrack = project.Timeline.GetOrCreateTrack(TrackType.Audio, "Music");

        // 1. Analyze Music if provided
        AudioAnalysisResult? audioAnalysis = null;
        TimeSpan musicDuration = TimeSpan.Zero;
        if (!string.IsNullOrEmpty(options.MusicFilePath) && File.Exists(options.MusicFilePath))
        {
            var audioInfo = await _mediaEngine.InspectAsync(options.MusicFilePath, ct);
            musicDuration = audioInfo.Duration;
            audioAnalysis = await _audioAnalyzer.AnalyzeAsync(options.MusicFilePath, ct);

            var audioClip = new AudioClip(options.MusicFilePath, musicDuration);
            audioClip.AudioSettings.FadeInDuration = TimeSpan.FromSeconds(0.5);
            audioClip.AudioSettings.FadeOutDuration = TimeSpan.FromSeconds(1.5);
            audioClip.WaveformData = await _mediaEngine.GenerateWaveformAsync(options.MusicFilePath, 200, ct);
            audioTrack.Clips.Add(audioClip);

            project.Assets.Add(new Asset
            {
                FilePath = options.MusicFilePath,
                Name = Path.GetFileName(options.MusicFilePath),
                Type = MediaType.Audio,
                Duration = musicDuration
            });
        }

        // 2. Calculate photo durations
        int count = options.PhotoFilePaths.Count;
        var durations = new List<TimeSpan>();

        if (audioAnalysis != null && options.TimingMode == TimingMode.BeatSync && audioAnalysis.BeatTimestamps.Count > count)
        {
            // Beat synchronization
            int step = Math.Max(1, audioAnalysis.BeatTimestamps.Count / count);
            TimeSpan lastTime = TimeSpan.Zero;
            for (int i = 0; i < count; i++)
            {
                int beatIdx = Math.Min((i + 1) * step, audioAnalysis.BeatTimestamps.Count - 1);
                TimeSpan beatTime = audioAnalysis.BeatTimestamps[beatIdx];
                TimeSpan dur = beatTime - lastTime;
                if (dur < TimeSpan.FromSeconds(1.2)) dur = TimeSpan.FromSeconds(1.2);
                durations.Add(dur);
                lastTime = lastTime + dur;
            }
        }
        else if (musicDuration > TimeSpan.Zero && options.TimingMode == TimingMode.Auto)
        {
            // Auto calculate duration: SongDuration / Count (constrained between 2.0s and 5.0s)
            double calculatedSec = musicDuration.TotalSeconds / count;
            calculatedSec = Math.Clamp(calculatedSec, 2.0, 5.0);
            for (int i = 0; i < count; i++)
            {
                durations.Add(TimeSpan.FromSeconds(calculatedSec));
            }
        }
        else
        {
            // Equal or Manual default
            double defaultSec = options.TargetPhotoDurationSeconds > 0 ? options.TargetPhotoDurationSeconds : template.DefaultPhotoDurationSeconds;
            for (int i = 0; i < count; i++)
            {
                durations.Add(TimeSpan.FromSeconds(defaultSec));
            }
        }

        // 3. Motion preset cycle to avoid repetition
        var motionCycle = new[]
        {
            MotionPreset.ZoomIn,
            MotionPreset.PanRight,
            MotionPreset.ZoomOut,
            MotionPreset.PanLeft,
            MotionPreset.DiagonalDownRight,
            MotionPreset.Cinematic,
            MotionPreset.PanUp
        };

        // 4. Build Photo Clips
        TimeSpan currentStartTime = TimeSpan.Zero;
        for (int i = 0; i < count; i++)
        {
            string photoPath = options.PhotoFilePaths[i];
            TimeSpan duration = durations[i];

            var imageClip = new ImageClip(photoPath, duration)
            {
                StartTime = currentStartTime,
                CropMode = template.CropMode,
                Motion = template.DefaultMotion == MotionPreset.Random ? motionCycle[i % motionCycle.Length] : template.DefaultMotion
            };

            // Apply template effects
            foreach (var effect in template.DefaultEffects)
            {
                imageClip.Effects.Add(effect.Clone());
            }

            // Apply transition between clips (except last clip)
            if (i < count - 1 && template.DefaultTransition != TransitionType.None)
            {
                imageClip.TransitionOut = new Transition(
                    template.DefaultTransition,
                    TimeSpan.FromSeconds(Math.Min(template.TransitionDurationSeconds, duration.TotalSeconds * 0.4)));
            }

            videoTrack.Clips.Add(imageClip);

            project.Assets.Add(new Asset
            {
                FilePath = photoPath,
                Name = Path.GetFileName(photoPath),
                Type = MediaType.Image,
                Duration = duration
            });

            currentStartTime += duration;
        }

        // Adjust audio track duration to match total video duration
        if (audioTrack.Clips.Count > 0 && audioTrack.Clips[0] is AudioClip audio)
        {
            if (audio.Duration > currentStartTime)
            {
                audio.Duration = currentStartTime;
            }
        }

        // 5. Add Title Text Overlay if requested
        if (options.AddTitleOverlay)
        {
            string titleText = !string.IsNullOrEmpty(options.CustomTitle) ? options.CustomTitle : template.SuggestedTitle;
            var textClip = new TextClip(titleText, TimeSpan.FromSeconds(Math.Min(4.0, currentStartTime.TotalSeconds * 0.5)))
            {
                StartTime = TimeSpan.FromSeconds(0.2)
            };
            textClip.Transform.AnchorX = 0.5;
            textClip.Transform.AnchorY = 0.85; // Bottom-third title positioning
            textClip.Overlay.FontSize = options.AspectRatio == AspectRatio.Ratio9x16 ? 56 : 48;
            textClip.Overlay.ColorHex = "#FFFFFF";
            textClip.Overlay.BackgroundColorHex = "#99000000"; // Dark translucent pill
            textClip.Overlay.EntryAnimation = TextAnimation.Slide;
            textClip.Overlay.ExitAnimation = TextAnimation.Fade;
            textClip.Overlay.AnimationDuration = TimeSpan.FromSeconds(0.6);

            overlayTrack.Clips.Add(textClip);
        }

        return project;
    }
}
