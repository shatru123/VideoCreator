# Video Export Engine

VideoCreator exports pristine MP4 files using `FFmpegExportEngine`.

## Pipeline Architecture
1. **Resolution & Canvas Normalization**: Ensures dimensions are even numbers (e.g., 1080x1920) for standard H.264 profile compatibility.
2. **Raw Video Frame Streaming**: Composited SkiaSharp RGBA frames are piped directly via standard input to FFmpeg (`-f rawvideo -pix_fmt rgba -s {W}x{H} -r {FPS} -i -`). This guarantees 100% visual fidelity between the real-time preview and the exported file.
3. **Audio Mixing & Filtering**: Background music is mixed with volume scaling and audio fade-in (`afade=t=in`) and fade-out (`afade=t=out`) filters.
4. **Encoding**: Encodes video with `libx264` (or hardware-accelerated encoder) in `yuv420p` pixel format with AAC stereo audio.
5. **Background Queue**: `ExportQueueService` manages asynchronous rendering jobs with live percentage, frame counts, time remaining estimates, and cancellation support.
