namespace VideoCreator.Core.Commands;

public interface ICommand
{
    string Description { get; }
    void Execute();
    void Undo();
}
