const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DEFAULT_PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4'
};

function createServer(port) {
  const server = http.createServer((req, res) => {
    // Parse URL and sanitize path
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let safePath = parsedUrl.pathname;
    if (safePath === '/' || safePath === '') {
      safePath = '/index.html';
    }

    // Look in root first (for GitHub Pages compatibility), then fallback to public/
    let filePath = path.join(__dirname, safePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(__dirname, 'public', safePath);
    }

    // Prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      fs.createReadStream(filePath).pipe(res);
    });
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`=================================================`);
    console.log(`   Screen Recorder Server Running!               `);
    console.log(`   URL: ${url}                                  `);
    console.log(`=================================================`);
    console.log(`Opening browser automatically...`);

    // Auto open browser on Windows
    exec(`start ${url}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      createServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

createServer(DEFAULT_PORT);
