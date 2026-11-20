import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import verify from './api/verify.js';
import evaluate from './api/evaluate.js';
import liveProof from './api/live-proof.js';

const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const app = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'");
  const url = new URL(req.url, 'http://localhost');
  const sendJson = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); return res; };
  if (url.pathname === '/api/verify' || url.pathname === '/api/evaluate' || url.pathname === '/api/live-proof') {
    let body = null;
    if (req.method === 'POST') {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8192) return sendJson(413, { error: 'PAYLOAD_TOO_LARGE' }); chunks.push(chunk); }
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return sendJson(400, { error: 'INVALID_JSON' }); }
    }
    const adapter = { method: req.method, query: Object.fromEntries(url.searchParams), body, headers: req.headers };
    const response = { setHeader: (k, v) => res.setHeader(k, v), status: status => ({ json: data => sendJson(status, data) }) };
    return (url.pathname === '/api/verify' ? verify : url.pathname === '/api/live-proof' ? liveProof : evaluate)(adapter, response);
  }
  if (!['GET', 'HEAD'].includes(req.method)) return sendJson(405, { error: 'METHOD_NOT_ALLOWED' });
  const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  if (!/^[a-zA-Z0-9._/-]+$/.test(file) || file.includes('..')) return sendJson(400, { error: 'BAD_PATH' });
  try {
    const data = await readFile(resolve(root, file));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { return sendJson(404, { error: 'NOT_FOUND' }); }
});
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log('TrustGate AI local server: http://localhost:' + port));
