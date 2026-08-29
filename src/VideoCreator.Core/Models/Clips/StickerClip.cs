using System;

namespace VideoCreator.Core.Models.Clips;

public class StickerClip : Clip
{
    public string StickerId { get; set; } = string.Empty;
    public string StickerFilePath { get; set; } = string.Empty;

    public StickerClip()
    {
        Name = "Sticker";
    }

    public override Clip Clone()
    {
        var clone = new StickerClip
        {
            StickerId = StickerId,
            StickerFilePath = StickerFilePath
        };
        CopyBasePropertiesTo(clone);
        return clone;
    }
}
