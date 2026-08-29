using System;

namespace VideoCreator.Media.Services;

public interface IAudioPlayerService : IDisposable
{
    bool IsPlaying { get; }
    void Play(string filePath, TimeSpan startTime, double volume = 1.0);
    void Pause();
    void Stop();
    void SetVolume(double volume);
}
