import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import importUrlHandler from './api/import-url.js';
import importImageHandler from './api/import-image.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, body) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('O pedido excede o limite permitido.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('O corpo do pedido não contém JSON válido.');
  }
}

async function handleApi(req, res, handler) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const proxyRes = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      if (res.writableEnded) return this;
      res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...this.headers });
      res.end(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      if (res.writableEnded) return this;
      res.writeHead(this.statusCode, { 'X-Content-Type-Options': 'nosniff', ...this.headers });
      res.end(payload);
      return this;
    }
  };

  try {
    await handler({ method: req.method, headers: req.headers, body, url: req.url }, proxyRes);
    if (!res.writableEnded) sendJson(res, 500, { error: 'A API não retornou uma resposta.' });
  } catch (error) {
    console.error('Erro na API:', error);
    sendJson(res, 500, { error: 'Erro interno ao processar o pedido.' });
  }
}

async function serveStatic(req, res, pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  let target = path.resolve(DIST_DIR, relative);
  if (!target.startsWith(DIST_DIR + path.sep) && target !== path.join(DIST_DIR, 'index.html')) {
    sendJson(res, 400, { error: 'Caminho inválido.' });
    return;
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
  } catch {
    // This app is a client-rendered SPA; unknown paths fall back to index.html.
    target = path.join(DIST_DIR, 'index.html');
  }

  try {
    const data = await readFile(target);
    const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  } catch {
    sendJson(res, 500, { error: 'Não foi possível carregar o site. Verifique se o build foi concluído.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/api/import-url' || url.pathname === '/api/import-image') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Use POST para esta operação.' }));
      return;
    }
    await handleApi(req, res, url.pathname.endsWith('import-url') ? importUrlHandler : importImageHandler);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Método não permitido.' });
    return;
  }
  await serveStatic(req, res, url.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Maré rodando na porta ${PORT}`);
});
