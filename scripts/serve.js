import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTutorHandler } from '../server/tutor.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const { questions } = JSON.parse(await readFile(resolve(root, 'questions.json'), 'utf8'));
const tutor = createTutorHandler({ questions });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp' };
const publicFiles = new Set(['/index.html','/styles.css','/app.js','/core.js','/tutor.js','/tutor-config.json','/questions.json']);
createServer({ maxHeaderSize: 8192 }, async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }
    if (path === '/api/chat') {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64000) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end('{"error":"Conversation too large."}'); return; }
        chunks.push(chunk);
      }
      const response = await tutor(new Request('http://localhost/api/chat', {
        method: req.method, headers: req.headers,
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Buffer.concat(chunks) } : {})
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end('Method not allowed'); return; }
    const publicPath = path === '/' ? '/index.html' : path;
    if (!publicFiles.has(publicPath) && !/^\/assets\/questions\/[a-zA-Z0-9-]+\.webp$/.test(publicPath)) { res.writeHead(404); res.end('Not found'); return; }
    const file = resolve(root, '.' + publicPath);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, host, () => console.log(`Helix is ready on ${host}:${port}`));
