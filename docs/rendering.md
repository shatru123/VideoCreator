# Rendering Pipeline & Compositing

VideoCreator uses a hybrid SkiaSharp compositing and FFmpeg hardware-accelerated encoding pipeline.

## Compositing Pipeline

```
Assets (Photos / Audio / Text)
              ↓
  Time Evaluation at Playhead t
              ↓
  Transform & Ken Burns Matrix
              ↓
     Transition Shaders
              ↓
   Color Effects & Filters
              ↓
      Text & Overlay Layer
              ↓
SkiaSharp 60fps Frame Buffer
              ↓
Avalonia Viewport / Export Pipe
```

## Ken Burns / Photo Motion
`PhotoMotionEngine` computes smooth cubic ease-in-out affine transformation matrices for:
- `ZoomIn`: 1.0x $\rightarrow$ 1.15x magnification centered on subject.
- `ZoomOut`: 1.15x $\rightarrow$ 1.0x reveal.
- `PanLeft` / `PanRight`: Horizontal camera sweep.
- `PanUp` / `PanDown`: Vertical camera sweep.
- `Cinematic`: Combined slow zoom and subtle pan.

## Transition Shaders
`TransitionRenderer` computes sub-frame interpolations:
- `CrossDissolve`: Alpha blend between outgoing and incoming frame.
- `SlideLeft` / `SlideRight` / `SlideUp` / `SlideDown`: Offset translation.
- `Push`: Continuous lateral frame push.
- `Zoom`: Scale zoom transition with alpha defocus.
- `Wipe`: Directional clipping mask sweep.
