# Timeline & Clip Architecture

VideoCreator features a non-destructive multi-track timeline system.

## Track Types
- **Video Track (`TrackType.Video`)**: Primary photos and video clips with Ken Burns motion and transitions.
- **Overlay Track (`TrackType.Overlay`)**: Text overlays, title cards, stickers, and secondary picture-in-picture clips.
- **Audio Track (`TrackType.Audio`)**: Background music and sound effects with volume envelopes and waveform generation.
- **Effect Track (`TrackType.Effect`)**: Global project grading and vignette overlays.

## Clip Polymorphism
All clips derive from the abstract `Clip` base class:
- `ImageClip`: Static photos with motion presets, crop mode (fit, fill, blur background), and transitions.
- `VideoClip`: Video media with source trimming, playback speed, and audio volume.
- `AudioClip`: Background audio with waveform data, fade-in, fade-out, trim, and loop.
- `TextClip`: Animated text overlays with typography, background pill, shadow, stroke, and entry/exit animations.
- `ShapeClip`: Vector shapes (rectangles, rounded rectangles, circles, pills).
- `StickerClip`: Graphic stickers with opacity and transform.

## Timeline Operations & Command Pattern
All operations are fully undoable and redoable via `UndoRedoManager`:
- `AddClipCommand`: Adds a clip to a track at a specified index.
- `DeleteClipCommand`: Removes a clip from a track, preserving original order on undo.
- `MoveClipCommand`: Changes clip start time and optionally moves between tracks.
- `ResizeClipCommand`: Adjusts clip duration.
- `SplitClipCommand`: Cuts a clip at the playhead into two independent clips.
- `ChangeTransitionCommand`: Updates transition type and duration.
- `AddEffectCommand` / `RemoveEffectCommand`: Manipulates non-destructive effect stacks.
