using SkiaSharp;
using VideoCreator.Core.Enums;

namespace VideoCreator.Media.Services;

public interface ISmartCropService
{
    SKBitmap ApplyCropAndBackground(SKBitmap sourceBitmap, int targetWidth, int targetHeight, CropMode mode, string? backgroundColorHex = "#000000");
}
