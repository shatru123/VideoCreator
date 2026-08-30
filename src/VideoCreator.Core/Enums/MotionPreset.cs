namespace VideoCreator.Core.Enums;

public enum MotionPreset
{
    None,
    ZoomIn,            // Smooth Ken Burns zoom in (1.0 -> 1.15)
    ZoomOut,           // Smooth Ken Burns zoom out (1.15 -> 1.0)
    ZoomInOut,         // Zoom in first half, zoom out second half
    PanLeft,           // Pan left across image
    PanRight,          // Pan right across image
    PanUp,             // Pan upward
    PanDown,           // Pan downward
    PanLeftToRight,    // Full left-to-right cinematic sweep
    PanRightToLeft,    // Full right-to-left sweep
    PanTopToBottom,    // Top to bottom tilt
    PanBottomToTop,    // Bottom to top tilt
    KenBurns,          // Classic Ken Burns diagonal zoom & pan
    SlowZoomIn,        // Gentle slow zoom in (1.0 -> 1.06)
    SlowZoomOut,       // Gentle slow zoom out (1.06 -> 1.0)
    DynamicZoom,       // Pulsing dynamic scale
    DiagonalUpLeft,    // Diagonal pan up-left
    DiagonalDownRight, // Diagonal pan down-right
    Cinematic,         // Subtle zoom in + slight horizontal pan
    RandomMotion,      // Assign varied motion
    Random = RandomMotion
}
