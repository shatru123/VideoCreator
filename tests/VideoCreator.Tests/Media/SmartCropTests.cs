using FluentAssertions;
using SkiaSharp;
using VideoCreator.Core.Enums;
using VideoCreator.Media.ImageProcessing;
using Xunit;

namespace VideoCreator.Tests.Media;

public class SmartCropTests
{
    [Fact]
    public void SmartCropService_ShouldProduceCorrectDimensionsWithBlurBackground()
    {
        var service = new SmartCropService();

        // Create a 1920x1080 landscape source bitmap
        using var sourceBmp = new SKBitmap(1920, 1080);
        using (var canvas = new SKCanvas(sourceBmp))
        {
            canvas.Clear(SKColors.Red);
        }

        // Apply Blur Background to fit into 9:16 (1080x1920) vertical canvas
        using var resultBmp = service.ApplyCropAndBackground(sourceBmp, 1080, 1920, CropMode.BlurBackground);

        resultBmp.Width.Should().Be(1080);
        resultBmp.Height.Should().Be(1920);
    }
}
