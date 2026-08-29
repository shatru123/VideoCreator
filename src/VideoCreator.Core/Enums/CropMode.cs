namespace VideoCreator.Core.Enums;

public enum CropMode
{
    Fit,            // Letterbox/pillarbox with black bars or canvas color
    Fill,           // Scale to fill canvas, clipping edges
    CenterCrop,     // Centered crop
    SmartCrop,      // Centered on subject area
    BlurBackground  // Blurred copy of image filling background behind fit image
}
