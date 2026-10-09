import { fetchPublicProperty, renderPublicPropertyHtml } from '../lib/public-property.js';

export default async function handler(req, res) {
  const token = typeof req.query?.token === 'string' ? req.query.token : '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Método não permitido.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Imóvel não encontrado | BancoImob</title><body><h1>Este link não é válido.</h1><p>Peça ao responsável um link atualizado.</p></body></html>');
  }
  try {
    const property = await fetchPublicProperty(token);
    if (!property || typeof property !== 'object' || !property.titulo) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Imóvel não encontrado | BancoImob</title><body><h1>Imóvel não encontrado.</h1><p>O link pode ter sido removido ou estar incorreto.</p></body></html>');
    }
    property.share_token = token;
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
    const origin = forwardedProto.split(',')[0].trim() + '://' + forwardedHost.split(',')[0].trim();
    const html = renderPublicPropertyHtml(property, origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    return res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch (error) {
    console.error('Erro ao carregar imóvel público:', error?.message || error);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    return res.status(503).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Prévia temporariamente indisponível | BancoImob</title><body><h1>Não foi possível abrir este imóvel agora.</h1><p>Tente novamente em instantes.</p></body></html>');
  }
}
