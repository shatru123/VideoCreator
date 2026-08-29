using Avalonia.Controls;
using Avalonia.Interactivity;
using VideoCreator.App.ViewModels;

namespace VideoCreator.App.Views;

public partial class HomeScreenView : UserControl
{
    public HomeScreenView()
    {
        InitializeComponent();
    }

    private void OnOpenRecentProjectClicked(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is RecentProjectItem item && DataContext is HomeViewModel vm)
        {
            vm.OpenRecentProjectCommand.Execute(item);
        }
    }
}
