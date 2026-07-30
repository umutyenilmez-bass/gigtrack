const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const API_PORT = 5001;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // Proxy /api/ requests to CfOS Express server
  if (req.url.startsWith('/api/')) {
    const proxyReq = http.request(
      {
        hostname: 'localhost',
        port: API_PORT,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `localhost:${API_PORT}`
        }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', () => {
      // Try fallback port 5000
      const fallbackReq = http.request(
        {
          hostname: 'localhost',
          port: 5000,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: 'localhost:5000'
          }
        },
        (fallbackRes) => {
          res.writeHead(fallbackRes.statusCode, fallbackRes.headers);
          fallbackRes.pipe(res, { end: true });
        }
      );

      fallbackReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend server unavailable' }));
      });

      req.pipe(fallbackReq, { end: true });
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  let safePath = req.url.split('?')[0];
  let filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`GigTrack running at http://localhost:${PORT}/ (Proxying /api to port ${API_PORT})`);
});
