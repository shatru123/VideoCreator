using System;
using System.Globalization;
using Avalonia.Data.Converters;
using VideoCreator.App.ViewModels;

namespace VideoCreator.App.Converters;

public class ScreenMatchConverter : IValueConverter
{
    public static readonly ScreenMatchConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is AppScreen currentScreen && parameter is string targetName)
        {
            if (Enum.TryParse<AppScreen>(targetName, out var targetScreen))
            {
                return currentScreen == targetScreen;
            }
        }
        return false;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
