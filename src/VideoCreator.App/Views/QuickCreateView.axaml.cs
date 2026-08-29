using System;
using System.IO;
using System.Linq;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using VideoCreator.App.ViewModels;

namespace VideoCreator.App.Views;

public partial class QuickCreateView : UserControl
{
    public QuickCreateView()
    {
        InitializeComponent();
    }

    private async void OnAddPhotosClicked(object? sender, RoutedEventArgs e)
    {
        var topLevel = TopLevel.GetTopLevel(this);
        if (topLevel == null || DataContext is not QuickCreateViewModel vm) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Select Photos",
            AllowMultiple = true,
            FileTypeFilter = new[]
            {
                new FilePickerFileType("Images")
                {
                    Patterns = new[] { "*.jpg", "*.jpeg", "*.png", "*.webp", "*.bmp", "*.heic", "*.JPG", "*.JPEG", "*.PNG" },
                    MimeTypes = new[] { "image/*" },
                    AppleUniformTypeIdentifiers = new[] { "public.image" }
                },
                new FilePickerFileType("All Files (*.*)")
                {
                    Patterns = new[] { "*.*" }
                }
            }
        });

        foreach (var file in files)
        {
            vm.AddPhoto(file.Path.LocalPath);
        }
    }

    private async void OnSelectMusicClicked(object? sender, RoutedEventArgs e)
    {
        var topLevel = TopLevel.GetTopLevel(this);
        if (topLevel == null || DataContext is not QuickCreateViewModel vm) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Select Background Music",
            AllowMultiple = false,
            FileTypeFilter = new[]
            {
                new FilePickerFileType("Audio Files (*.mp3, *.wav, *.m4a, *.aac, *.flac, *.ogg)")
                {
                    Patterns = new[] { "*.mp3", "*.wav", "*.m4a", "*.aac", "*.flac", "*.ogg", "*.MP3", "*.WAV", "*.M4A" },
                    MimeTypes = new[] { "audio/*" },
                    AppleUniformTypeIdentifiers = new[] { "public.audio" }
                },
                new FilePickerFileType("All Files (*.*)")
                {
                    Patterns = new[] { "*.*" }
                }
            }
        });

        var selected = files.FirstOrDefault();
        if (selected != null)
        {
            vm.SetMusic(selected.Path.LocalPath);
        }
    }

    private void OnRemovePhotoClicked(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is PhotoItem item && DataContext is QuickCreateViewModel vm)
        {
            vm.RemovePhotoCommand.Execute(item);
        }
    }
}
