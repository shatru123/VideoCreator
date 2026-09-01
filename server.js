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
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const id = urlObj.searchParams.get('id') || '';
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
    if (!cleanId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid video ID' }));
      return;
    }

    const assetsDir = path.join(WEB_DIR, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    const cacheFile = path.join(assetsDir, `yt_cache_${cleanId}.mp3`);
    const relativeUrl = `assets/yt_cache_${cleanId}.mp3`;

    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1000) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, audioUrl: relativeUrl }));
      return;
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
    const cmd = `"${ytdlpPath}" --extractor-args "youtube:player_client=ios,android,mweb" -x --audio-format mp3 -o "${outPattern}" "https://www.youtube.com/watch?v=${cleanId}"`;

    exec(cmd, (err) => {
      if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, audioUrl: relativeUrl }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Extraction failed: ' + (err ? err.message : 'Unknown') }));
      }
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
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stats.size });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 VideoCreator Studio running locally at: http://localhost:${PORT}/`);
});
