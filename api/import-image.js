const LISTING_HOST = /(^|\\.)temporadalivre\\.com$/i;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\\\\\\//g, '/');
}

function listingUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !LISTING_HOST.test(url.hostname) || url.username || url.password) {
    throw new Error('Use um link HTTPS do TemporadaLivre.');
  }
  return url;
}

function imageUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') ||
      host === 'localhost' || host.endsWith('.localhost') || /^\\d{1,3}(?:\\.\\d{1,3}){3}$/.test(host) ||
      host === '::1' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') ||
      /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host)) {
    throw new Error('O endereço da imagem não é permitido.');
  }
  return url;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST para copiar uma imagem.' });
  }

  try {
    const submittedListing = typeof req.body?.listingUrl === 'string' ? req.body.listingUrl.trim() : '';
    const submittedImage = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
    if (!submittedListing || submittedListing.length > 2048 || !submittedImage || submittedImage.length > 4096) {
      return res.status(400).json({ error: 'Informe o anúncio e a imagem.' });
    }

    let currentListing = listingUrl(submittedListing);
    let page;
    for (let attempt = 0; attempt < 4; attempt++) {
      page = await fetch(currentListing, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MareListingImporter/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      if (![301, 302, 303, 307, 308].includes(page.status)) break;
      const location = page.headers.get('location');
      if (!location || attempt === 3) throw new Error('O anúncio redirecionou muitas vezes.');
      currentListing = listingUrl(new URL(location, currentListing).toString());
    }
    if (!page?.ok || !(page.headers.get('content-type') || '').includes('text/html')) {
      throw new Error('Não foi possível validar a origem da imagem no anúncio.');
    }
    const html = decodeHtml((await page.text()).slice(0, 2_000_000));
    const requested = imageUrl(submittedImage);
    const normalizedHtml = html.replace(/\\\\\\//g, '/');
    if (!normalizedHtml.includes(requested.toString()) && !normalizedHtml.includes(requested.toString().replace(/&/g, '&amp;'))) {
      throw new Error('A imagem não foi encontrada no anúncio informado.');
    }

    let currentImage = requested;
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(currentImage, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MareListingImporter/1.0)', 'Accept': 'image/avif,image/webp,image/png,image/jpeg' }
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || attempt === 3) throw new Error('A imagem redirecionou muitas vezes.');
      const next = imageUrl(new URL(location, currentImage).toString());
      if (next.hostname !== requested.hostname) throw new Error('O servidor da imagem redirecionou para outro domínio.');
      currentImage = next;
    }
    if (!response?.ok) throw new Error('Não foi possível baixar a imagem original.');
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) throw new Error('O arquivo não é uma imagem compatível.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE_BYTES) throw new Error('A imagem excede o limite de 8 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('A imagem está vazia ou excede 8 MB.');

    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(bytes);
  } catch (error) {
    return res.status(400).json({
      error: error?.name === 'TimeoutError'
        ? 'A cópia da imagem demorou demais. A foto continuará usando o link original.'
        : error?.message || 'Falha ao copiar a imagem.'
    });
  }
}
