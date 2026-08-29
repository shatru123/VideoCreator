using System;
using System.Collections.Generic;

namespace VideoCreator.Core.Commands;

public class UndoRedoManager
{
    private readonly Stack<ICommand> _undoStack = new();
    private readonly Stack<ICommand> _redoStack = new();
    private readonly int _maxHistory;

    public event EventHandler? StateChanged;

    public bool CanUndo => _undoStack.Count > 0;
    public bool CanRedo => _redoStack.Count > 0;
    public int UndoCount => _undoStack.Count;
    public int RedoCount => _redoStack.Count;

    public UndoRedoManager(int maxHistory = 100)
    {
        _maxHistory = maxHistory;
    }

    public void Execute(ICommand command)
    {
        command.Execute();
        _undoStack.Push(command);
        _redoStack.Clear();

        if (_undoStack.Count > _maxHistory)
        {
            var list = new List<ICommand>(_undoStack);
            _undoStack.Clear();
            for (int i = list.Count - 2; i >= 0; i--)
            {
                _undoStack.Push(list[i]);
            }
        }

        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Undo()
    {
        if (!CanUndo) return;

        var command = _undoStack.Pop();
        command.Undo();
        _redoStack.Push(command);
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Redo()
    {
        if (!CanRedo) return;

        var command = _redoStack.Pop();
        command.Execute();
        _undoStack.Push(command);
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Clear()
    {
        _undoStack.Clear();
        _redoStack.Clear();
        StateChanged?.Invoke(this, EventArgs.Empty);
    }
}
