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

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function absoluteHttpUrl(value, fallback = '') {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

async function getPublicProperty(token) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) throw new Error('A configuração pública do catálogo não está disponível.');
  const response = await fetch(new URL('/rest/v1/rpc/mare_public_imovel', supabaseUrl), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ p_token: token }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Não foi possível consultar o imóvel compartilhado.');
  return response.json();
}

function publicPropertyHtml(property, origin) {
  const title = String(property.titulo || 'Imóvel para temporada');
  const place = [property.bairro, property.cidade, property.uf].filter(Boolean).join(', ') || 'Juquehy, São Sebastião';
  const photos = (Array.isArray(property.fotos) ? property.fotos : [])
    .map(item => absoluteHttpUrl(item?.url))
    .filter(Boolean);
  const cover = photos[0] || new URL('/og-bancoimob.png', origin).href;
  const description = String(property.descricao || [
    property.dormitorios ? property.dormitorios + ' dormitórios' : '',
    property.suites ? property.suites + ' suítes' : '',
    property.distancia_praia === 0 ? 'Pé na areia' : Number.isFinite(Number(property.distancia_praia)) && property.distancia_praia !== null ? property.distancia_praia + ' m da praia' : ''
  ].filter(Boolean).join(' · ') || 'Conheça este imóvel para temporada em Juquehy.');
  const featureList = [];
  if (Number(property.dormitorios) > 0) featureList.push(property.dormitorios + ' dormitórios');
  if (Number(property.suites) > 0) featureList.push(property.suites + ' suítes');
  if (Number(property.capacidade) > 0) featureList.push('Até ' + property.capacidade + ' hóspedes');
  if (property.distancia_praia !== null && property.distancia_praia !== undefined && property.distancia_praia !== '') {
    featureList.push(Number(property.distancia_praia) === 0 ? 'Pé na areia' : property.distancia_praia + ' m da praia');
  }
  const amenities = [...new Set([
    ...(Array.isArray(property.comodidades) ? property.comodidades : []),
    property.piscina ? 'Piscina' : '',
    property.churrasqueira ? 'Churrasqueira' : '',
    property.area_gourmet ? 'Área gourmet' : '',
    property.servico_praia ? 'Serviço de praia' : ''
  ].filter(item => typeof item === 'string' && item.trim()))];
  const photoGallery = photos.length
    ? photos.map((url, index) => '<figure><img src="' + escapeHtml(url) + '" alt="' + escapeHtml(title) + '" loading="' + (index === 0 ? 'eager' : 'lazy') + '"></figure>').join('')
    : '<div class="no-photo">Fotos deste imóvel serão adicionadas em breve.</div>';
  const canonical = new URL('/imovel/' + encodeURIComponent(property.share_token || ''), origin).href;
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#123b35">' +
    '<meta name="description" content="' + escapeHtml(description.slice(0, 300)) + '">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="BancoImob"><meta property="og:title" content="' + escapeHtml(title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(description.slice(0, 300)) + '"><meta property="og:url" content="' + escapeHtml(canonical) + '">' +
    '<meta property="og:image" content="' + escapeHtml(cover) + '"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + escapeHtml(title) + '"><meta name="twitter:description" content="' + escapeHtml(description.slice(0, 300)) + '"><meta name="twitter:image" content="' + escapeHtml(cover) + '">' +
    '<title>' + escapeHtml(title) + ' | BancoImob</title><style>' +
    '*{box-sizing:border-box}body{margin:0;background:#f5f3ed;color:#193b35;font:16px/1.6 Arial,Helvetica,sans-serif}.top{background:#123b35;color:#fff;padding:18px max(20px,calc((100% - 1120px)/2));font-weight:700;letter-spacing:.3px}.top a{color:inherit;text-decoration:none}.wrap{max-width:1120px;margin:0 auto;padding:30px 22px 64px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15;margin:8px 0 10px}.location{color:#5c716b;margin:0 0 22px}.hero{width:100%;aspect-ratio:3/2;max-height:650px;background:#e5e8df;border-radius:18px;overflow:hidden}.hero img{width:100%;height:100%;object-fit:cover;display:block}.facts{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}.fact,.amenity{background:#e4ebe3;border-radius:999px;padding:8px 14px;font-size:14px}.desc{white-space:pre-line;overflow-wrap:anywhere;margin:22px 0}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;margin-top:18px}.gallery figure{margin:0;aspect-ratio:3/2;border-radius:14px;overflow:hidden;background:#e5e8df}.gallery img{width:100%;height:100%;object-fit:cover;display:block}.section-title{margin-top:34px}.footer{margin-top:46px;border-top:1px solid #d8dfd5;padding-top:18px;color:#5c716b;font-size:13px}.no-photo{padding:50px 20px;background:#e5e8df;border-radius:16px;text-align:center}@media(max-width:600px){.wrap{padding:20px 14px 44px}.top{padding:16px 14px}.hero{border-radius:12px}}' +
    '</style></head><body><header class="top"><a href="/">≈ BancoImob</a></header><main class="wrap"><small>IMÓVEL PARA TEMPORADA</small><h1>' + escapeHtml(title) + '</h1><p class="location">' + escapeHtml(place) + '</p>' +
    '<div class="hero">' + (photos[0] ? '<img src="' + escapeHtml(photos[0]) + '" alt="' + escapeHtml(title) + '">' : '<div class="no-photo">Foto não cadastrada</div>') + '</div>' +
    (featureList.length ? '<div class="facts">' + featureList.map(item => '<span class="fact">' + escapeHtml(item) + '</span>').join('') + '</div>' : '') +
    (amenities.length ? '<h2>Comodidades</h2><div class="facts">' + amenities.map(item => '<span class="amenity">' + escapeHtml(item) + '</span>').join('') + '</div>' : '') +
    (property.descricao ? '<h2>Sobre o imóvel</h2><p class="desc">' + escapeHtml(property.descricao) + '</p>' : '') +
    '<h2 class="section-title">Fotos do imóvel</h2><div class="gallery">' + photoGallery + '</div><footer class="footer">BancoImob · Catálogo de imóveis para temporada.<br>Valores e disponibilidade devem ser confirmados com o responsável.</footer></main></body></html>';
}

async function servePublicProperty(req, res, token, origin) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Imóvel não encontrado | BancoImob</title><body><h1>Este link não é válido.</h1><p>Peça ao responsável um link atualizado.</p></body></html>');
    return;
  }
  try {
    const property = await getPublicProperty(token);
    if (!property || typeof property !== 'object' || !property.titulo) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Imóvel não encontrado | BancoImob</title><body><h1>Imóvel não encontrado.</h1><p>O link pode ter sido removido ou estar incorreto.</p></body></html>');
      return;
    }
    property.share_token = token;
    const html = publicPropertyHtml(property, origin);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error('Erro ao carregar imóvel público:', error?.message || error);
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' });
    res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Prévia temporariamente indisponível | BancoImob</title><body><h1>Não foi possível abrir este imóvel agora.</h1><p>Tente novamente em instantes.</p></body></html>');
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
  if ((req.method === 'GET' || req.method === 'HEAD') && /^\/imovel\/[0-9a-f-]{36}$/i.test(url.pathname)) {
    await servePublicProperty(req, res, url.pathname.split('/')[2], new URL(req.url || '/', 'https://' + (req.headers.host || 'localhost')).origin);
    return;
  }

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
  console.log(`BancoImob rodando na porta ${PORT}`);
});
