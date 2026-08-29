using System;
using System.IO;
using System.Threading.Tasks;

namespace VideoCreator.Application.Cache;

public interface ICacheService
{
    string CacheDirectory { get; }
    string GetCacheFilePath(string key, string extension);
    Task ClearCacheAsync();
    long GetCacheSizeBytes();
}

public class CacheService : ICacheService
{
    public string CacheDirectory { get; }

    public CacheService(string? customDir = null)
    {
        CacheDirectory = customDir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VideoCreator", "Cache");
        if (!Directory.Exists(CacheDirectory)) Directory.CreateDirectory(CacheDirectory);
    }

    public string GetCacheFilePath(string key, string extension)
    {
        string safeKey = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key)));
        return Path.Combine(CacheDirectory, $"{safeKey}.{extension.TrimStart('.')}");
    }

    public async Task ClearCacheAsync()
    {
        await Task.Run(() =>
        {
            if (Directory.Exists(CacheDirectory))
            {
                foreach (var file in Directory.GetFiles(CacheDirectory))
                {
                    try { File.Delete(file); } catch { }
                }
            }
        });
    }

    public long GetCacheSizeBytes()
    {
        if (!Directory.Exists(CacheDirectory)) return 0;
        long total = 0;
        foreach (var file in Directory.GetFiles(CacheDirectory))
        {
            try { total += new FileInfo(file).Length; } catch { }
        }
        return total;
    }
}
