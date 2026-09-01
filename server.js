const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WEB_DIR = path.join(__dirname, 'web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

const { exec } = require('child_process');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache');

  // YouTube Real Audio Extraction API
  if (req.url.startsWith('/api/youtube-audio')) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const videoId = parsedUrl.searchParams.get('id');
    const cleanId = (videoId || '').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!cleanId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing or invalid YouTube video ID' }));
      return;
    }

    const assetsDir = path.join(WEB_DIR, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    // Check if any cached audio file exists for this video
    const existingFiles = fs.readdirSync(assetsDir).filter(f => f.startsWith(`yt_cache_${cleanId}.`));
    if (existingFiles.length > 0) {
      const existingFile = path.join(assetsDir, existingFiles[0]);
      if (fs.statSync(existingFile).size > 1000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, audioUrl: `assets/${existingFiles[0]}` }));
        return;
      }
    }

    const localBin = path.join(__dirname, 'bin', 'yt-dlp');
    const ytdlpPath = fs.existsSync(localBin)
      ? localBin
      : (fs.existsSync('/opt/homebrew/bin/yt-dlp')
        ? '/opt/homebrew/bin/yt-dlp'
        : (fs.existsSync('/usr/local/bin/yt-dlp')
          ? '/usr/local/bin/yt-dlp'
          : (fs.existsSync('/usr/bin/yt-dlp')
            ? '/usr/bin/yt-dlp'
            : (fs.existsSync('/Users/shatrughnaambhore/Library/Python/3.9/bin/yt-dlp') ? '/Users/shatrughnaambhore/Library/Python/3.9/bin/yt-dlp' : 'yt-dlp'))));

    const outPattern = path.join(assetsDir, `yt_cache_${cleanId}.%(ext)s`);
    const cmd = `"${ytdlpPath}" --extractor-args "youtube:player_client=ios,android,mweb" -f "ba/b" -x --audio-format mp3 -o "${outPattern}" "https://www.youtube.com/watch?v=${cleanId}" || "${ytdlpPath}" --extractor-args "youtube:player_client=ios,android,mweb" -f "ba/b" -o "${outPattern}" "https://www.youtube.com/watch?v=${cleanId}"`;

    exec(cmd, (err) => {
      const downloadedFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter(f => f.startsWith(`yt_cache_${cleanId}.`)) : [];
      if (downloadedFiles.length > 0) {
        const file = path.join(assetsDir, downloadedFiles[0]);
        if (fs.statSync(file).size > 1000) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, audioUrl: `assets/${downloadedFiles[0]}` }));
          return;
        }
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Extraction failed: ' + (err ? err.message : 'Unknown') }));
    });
    return;
  }

  let safePath = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[\/])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';
  
  const filePath = path.join(WEB_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + safePath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 VideoCreator Studio running locally at: http://localhost:${PORT}/`);
});
