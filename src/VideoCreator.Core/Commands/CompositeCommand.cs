using System.Collections.Generic;

namespace VideoCreator.Core.Commands;

public class CompositeCommand : ICommand
{
    private readonly List<ICommand> _commands = new();
    public string Description { get; }

    public CompositeCommand(string description, IEnumerable<ICommand> commands)
    {
        Description = description;
        _commands.AddRange(commands);
    }

    public void Execute()
    {
        foreach (var cmd in _commands) cmd.Execute();
    }

    public void Undo()
    {
        for (int i = _commands.Count - 1; i >= 0; i--)
        {
            _commands[i].Undo();
        }
    }
}
