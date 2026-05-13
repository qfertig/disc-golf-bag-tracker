const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'out');
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.stat(filePath, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err, body) => {
      if (err) {
        fs.readFile(path.join(root, '404.html'), (notFoundErr, notFoundBody) => {
          res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
          res.end(notFoundErr ? 'not found' : notFoundBody);
        });
        return;
      }
      res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    });
  });
}).listen(port, host, () => {
  console.log(`Static server listening on http://${host}:${port}`);
});
