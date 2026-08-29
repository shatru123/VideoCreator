using System;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using VideoCreator.App.ViewModels;
using VideoCreator.Core.Models.Clips;

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
            Title = "Add Photo to Timeline",
            AllowMultiple = true,
            FileTypeFilter = new[]
            {
                new FilePickerFileType("Images")
                {
                    Patterns = new[] { "*.jpg", "*.jpeg", "*.png", "*.webp", "*.bmp" }
                }
            }
        });

        foreach (var file in files)
        {
            vm.AddPhotoToTimeline(file.Path.LocalPath);
        }
    }
}
