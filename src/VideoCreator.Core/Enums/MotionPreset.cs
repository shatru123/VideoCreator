namespace VideoCreator.Core.Enums;

public enum MotionPreset
{
    None,
    ZoomIn,        // Smooth Ken Burns zoom in (1.0 -> 1.15)
    ZoomOut,       // Smooth Ken Burns zoom out (1.15 -> 1.0)
    PanLeft,       // Pan left across image
    PanRight,      // Pan right across image
    PanUp,         // Pan upward
    PanDown,       // Pan downward
    DiagonalUpLeft,
    DiagonalDownRight,
    Cinematic,     // Subtle zoom in + slight pan
    Random         // Dynamic pseudo-random motion selection per clip
}
