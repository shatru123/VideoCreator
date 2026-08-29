using System;

namespace VideoCreator.Core.Models.Clips;

public class TextClip : Clip
{
    public TextOverlay Overlay { get; set; } = new();

    public TextClip()
    {
        Name = "Text";
    }

    public TextClip(string text, TimeSpan duration) : this()
    {
        Overlay.Text = text;
        Duration = duration;
        Name = string.IsNullOrWhiteSpace(text) ? "Text" : (text.Length > 15 ? text[..15] + "..." : text);
    }

    public override Clip Clone()
    {
        var clone = new TextClip
        {
            Overlay = Overlay.Clone()
        };
        CopyBasePropertiesTo(clone);
        return clone;
    }
}
