using System;
using System.IO;
using System.Linq;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using VideoCreator.App.ViewModels;
using VideoCreator.Core.Models;
using VideoCreator.Core.Models.Clips;
using VideoCreator.Core.Models.Templates;

namespace VideoCreator.App.Views;

public partial class MainEditorView : UserControl
{
    public MainEditorView()
    {
        InitializeComponent();
    }

    private void OnTimelineSeekRequested(object? sender, TimeSpan seekTime)
    {
        if (DataContext is EditorViewModel vm)
        {
            vm.Seek(seekTime);
        }
    }

    private void OnTimelineClipSelectionChanged(object? sender, Clip? selectedClip)
    {
        if (DataContext is EditorViewModel vm)
        {
            vm.SelectClip(selectedClip);
        }
    }

    private async void OnAddPhotoFileClicked(object? sender, RoutedEventArgs e)
    {
        var topLevel = TopLevel.GetTopLevel(this);
        if (topLevel == null || DataContext is not EditorViewModel vm) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Select Photos to Add to Project",
            AllowMultiple = true,
            FileTypeFilter = new[]
            {
                new FilePickerFileType("Image Files")
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
            vm.AddPhotoToTimeline(file.Path.LocalPath);
        }
    }

    private async void OnAddMusicFileClicked(object? sender, RoutedEventArgs e)
    {
        var topLevel = TopLevel.GetTopLevel(this);
        if (topLevel == null || DataContext is not EditorViewModel vm) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Upload Background Music / Audio",
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
            vm.AddMusicToTimeline(selected.Path.LocalPath);
        }
    }

    private void OnAddLibraryAssetClicked(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is Asset asset && DataContext is EditorViewModel vm)
        {
            vm.AddPhotoToTimeline(asset.FilePath);
        }
    }

    private void OnInsertTextPresetClicked(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is TextPresetItem preset && DataContext is EditorViewModel vm)
        {
            vm.InsertTextPreset(preset);
        }
    }

    private void OnApplyTemplateClicked(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is Template template && DataContext is EditorViewModel vm)
        {
            vm.ApplyTemplateToProject(template);
        }
    }

    private void OnRemoveAssetClicked(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is Asset asset && DataContext is EditorViewModel vm)
        {
            vm.RemoveAsset(asset);
        }
    }
}
