using System;
using System.Collections.Generic;

namespace VideoCreator.Infrastructure.Localization;

public class LocalizationService
{
    private string _currentLanguage = "en";
    private readonly Dictionary<string, Dictionary<string, string>> _translations = new();

    public string CurrentLanguage
    {
        get => _currentLanguage;
        set
        {
            if (_translations.ContainsKey(value))
            {
                _currentLanguage = value;
                LanguageChanged?.Invoke(this, _currentLanguage);
            }
        }
    }

    public event EventHandler<string>? LanguageChanged;

    public LocalizationService()
    {
        InitializeTranslations();
    }

    public string GetString(string key, string defaultValue = "")
    {
        if (_translations.TryGetValue(_currentLanguage, out var langDict) && langDict.TryGetValue(key, out var val))
            return val;

        if (_translations.TryGetValue("en", out var enDict) && enDict.TryGetValue(key, out var enVal))
            return enVal;

        return string.IsNullOrEmpty(defaultValue) ? key : defaultValue;
    }

    private void InitializeTranslations()
    {
        // English
        _translations["en"] = new Dictionary<string, string>
        {
            ["AppTitle"] = "VideoCreator",
            ["CreateVideo"] = "Create Video",
            ["QuickCreate"] = "Quick Create",
            ["AdvancedEditor"] = "Advanced Editor",
            ["AddPhotos"] = "Add Photos",
            ["AddMusic"] = "Add Music",
            ["SelectTemplate"] = "Choose Template",
            ["AspectRatio"] = "Aspect Ratio",
            ["GenerateVideo"] = "Generate Video",
            ["Preview"] = "Preview",
            ["Export"] = "Export",
            ["Undo"] = "Undo",
            ["Redo"] = "Redo",
            ["Save"] = "Save",
            ["Inspector"] = "Inspector",
            ["Transform"] = "Transform",
            ["Motion"] = "Motion",
            ["Effects"] = "Effects",
            ["Transitions"] = "Transitions",
            ["Text"] = "Text",
            ["Audio"] = "Audio",
            ["Split"] = "Split",
            ["Delete"] = "Delete"
        };

        // Hindi
        _translations["hi"] = new Dictionary<string, string>
        {
            ["AppTitle"] = "वीडियो क्रिएटर",
            ["CreateVideo"] = "वीडियो बनाएं",
            ["QuickCreate"] = "त्वरित निर्माण",
            ["AdvancedEditor"] = "उन्नत संपादक",
            ["AddPhotos"] = "फ़ोटो जोड़ें",
            ["AddMusic"] = "संगीत जोड़ें",
            ["SelectTemplate"] = "टेम्पलेट चुनें",
            ["AspectRatio"] = "पहलू अनुपात",
            ["GenerateVideo"] = "वीडियो उत्पन्न करें",
            ["Preview"] = "पूर्वावलोकन",
            ["Export"] = "निर्यात",
            ["Undo"] = "पूर्ववत करें",
            ["Redo"] = "फिर से करें",
            ["Save"] = "सहेजें",
            ["Inspector"] = "गुण",
            ["Transform"] = "रूपांतरण",
            ["Motion"] = "गति",
            ["Effects"] = "प्रभाव",
            ["Transitions"] = "परिवर्तन",
            ["Text"] = "पाठ",
            ["Audio"] = "ध्वनि",
            ["Split"] = "विभाजित करें",
            ["Delete"] = "हटाएं"
        };

        // Marathi
        _translations["mr"] = new Dictionary<string, string>
        {
            ["AppTitle"] = "व्हिडिओ क्रिएटर",
            ["CreateVideo"] = "व्हिडिओ तयार करा",
            ["QuickCreate"] = "झटपट निर्मिती",
            ["AdvancedEditor"] = "प्रगत संपादक",
            ["AddPhotos"] = "फोटो जोडा",
            ["AddMusic"] = "संगीत जोडा",
            ["SelectTemplate"] = "टेम्पलेट निवडा",
            ["AspectRatio"] = "प्रमाण गुणोत्तर",
            ["GenerateVideo"] = "व्हिडिओ तयार करा",
            ["Preview"] = "पूर्वावलोकन",
            ["Export"] = "निर्यात",
            ["Undo"] = "मागे घ्या",
            ["Redo"] = "पुढे जा",
            ["Save"] = "जतन करा",
            ["Inspector"] = "गुणधर्म",
            ["Transform"] = "रूपांतरण",
            ["Motion"] = "गती",
            ["Effects"] = "प्रभाव",
            ["Transitions"] = "संक्रमण",
            ["Text"] = "मजकूर",
            ["Audio"] = "ध्वनी",
            ["Split"] = "विभाजित करा",
            ["Delete"] = "हटवा"
        };
    }
}
