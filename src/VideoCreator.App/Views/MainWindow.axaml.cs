using System;
using System.Linq;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using VideoCreator.App.ViewModels;

namespace VideoCreator.App.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        AddHandler(KeyDownEvent, OnGlobalKeyDown, handledEventsToo: false);
    }

    private async void OnOpenProjectFileClicked(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not MainViewModel vm) return;

        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Open VideoCreator Project",
            AllowMultiple = false,
            FileTypeFilter = new[]
            {
                new FilePickerFileType("VideoCreator Project (*.vcproj)")
                {
                    Patterns = new[] { "*.vcproj", "*.json" }
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
            await vm.OpenProjectFromFileAsync(selected.Path.LocalPath);
        }
    }

    private void OnGlobalKeyDown(object? sender, KeyEventArgs e)
    {
        if (DataContext is not MainViewModel mainVm) return;

        var editorVm = mainVm.EditorVm;

        // Space -> Play/Pause
        if (e.Key == Key.Space)
        {
            editorVm.PlayPauseCommand.Execute(null);
            e.Handled = true;
        }
        // Delete -> Delete clip
        else if (e.Key == Key.Delete || e.Key == Key.Back)
        {
            if (editorVm.SelectedClip != null)
            {
                editorVm.DeleteClipCommand.Execute(null);
                e.Handled = true;
            }
        }
        // S -> Split clip
        else if (e.Key == Key.S)
        {
            if (editorVm.SelectedClip != null)
            {
                editorVm.SplitClipCommand.Execute(null);
                e.Handled = true;
            }
        }
        // Cmd/Ctrl + Z -> Undo
        else if (e.Key == Key.Z && (e.KeyModifiers.HasFlag(KeyModifiers.Control) || e.KeyModifiers.HasFlag(KeyModifiers.Meta)))
        {
            if (e.KeyModifiers.HasFlag(KeyModifiers.Shift))
            {
                editorVm.RedoCommand.Execute(null);
            }
            else
            {
                editorVm.UndoCommand.Execute(null);
            }
            e.Handled = true;
        }
        // Cmd/Ctrl + S -> Save
        else if (e.Key == Key.S && (e.KeyModifiers.HasFlag(KeyModifiers.Control) || e.KeyModifiers.HasFlag(KeyModifiers.Meta)))
        {
            editorVm.SaveCommand.Execute(null);
            e.Handled = true;
        }
        // Cmd/Ctrl + E -> Export
        else if (e.Key == Key.E && (e.KeyModifiers.HasFlag(KeyModifiers.Control) || e.KeyModifiers.HasFlag(KeyModifiers.Meta)))
        {
            editorVm.OpenExportCommand.Execute(null);
            e.Handled = true;
        }
    }
}
