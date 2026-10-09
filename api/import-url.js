const ALLOWED_HOST = /(^|\.)temporadalivre\.com$/i;

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function meta(html, ...keys) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const key of keys) {
    for (const tag of tags) {
      const name = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (name !== key.toLowerCase()) continue;
      const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
      if (content !== undefined) return decodeHtml(content);
    }
  }
  return '';
}

function validUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname) || url.username || url.password) {
    throw new Error('Por segurança, use um link HTTPS do TemporadaLivre.');
  }
  return url;
}

function absoluteImage(raw, base) {
  try {
    const url = new URL(decodeHtml(raw).trim(), base);
    if (url.protocol !== 'https:' || url.href === new URL(base).href) return '';
    const path = url.pathname.toLowerCase();
    const bad = /(logo|avatar|icon|sprite|placeholder|loading|pixel|flag|keyboard|arrow|eye|password|visibility|captcha|emoji|favicon|badge)/i;
    if (bad.test(path) || /\.(svg|gif)(?:$|\?)/i.test(path)) return '';
    return url.toString();
  } catch { return ''; }
}

function collectImages(html, current) {
  const candidates = [];
  const add = (raw, tag = '') => {
    const url = absoluteImage(raw, current);
    if (!url || candidates.some(x => x.url === url)) return;
    const w = Number(tag.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1] || 0);
    const h = Number(tag.match(/\bheight\s*=\s*["']?(\d+)/i)?.[1] || 0);
    if ((w && w < 180) || (h && h < 130)) return;
    let score = 0;
    if (w >= 600) score += 4;
    if (h >= 400) score += 4;
    if (w >= 1000) score += 3;
    if (/(large|original|full|high|gallery|photo|imovel|property|listing)/i.test(url)) score += 2;
    if (/(thumb|small|mini|resize|tiny|low|150x|100x)/i.test(url)) score -= 4;
    candidates.push({url,score,order:candidates.length});
  };
  const og = meta(html, 'og:image:secure_url', 'og:image');
  const tw = meta(html, 'twitter:image', 'twitter:image:src');
  if (og) add(og);
  if (tw) add(tw);
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imageTags) {
    if (/(flag|bandeira|keyboard|arrow|eye|password|visibility|icon|logo|captcha)/i.test(tag)) continue;
    for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-image', 'src']) {
      const value = tag.match(new RegExp('\\b' + attr + '\\s*=\\s*["\\x27]([^"\\x27]+)', 'i'))?.[1];
      if (value) add(value, tag);
    }
    const srcset = tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i)?.[1];
    if (srcset) {
      const options = srcset.split(',').map(part => part.trim()).map(part => {
        const m = part.match(/^(\S+)\s+(\d+)(w|x)$/);
        return m ? {url:m[1],size:Number(m[2])} : {url:part.split(/\s+/)[0],size:0};
      }).sort((x,y)=>y.size-x.size);
      if (options[0]?.url) add(options[0].url, tag + ' width="' + (options[0].size||0) + '"');
    }
  }
  return candidates.sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,12).map(x=>x.url);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST para importar um anúncio.' });
  }

  try {
    const submitted = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!submitted || submitted.length > 2048) {
      return res.status(400).json({ error: 'Informe um link válido do TemporadaLivre.' });
    }

    let current = validUrl(submitted);
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MareListingImporter/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || attempt === 3) throw new Error('O anúncio redirecionou muitas vezes.');
      current = validUrl(new URL(location, current).toString());
    }

    if (!response?.ok) {
      const status = response?.status || 0;
      throw new Error(status === 403 || status === 429
        ? 'O site bloqueou a leitura automática. Copie o texto do anúncio e use a opção “Colar texto”.'
        : 'Não consegui abrir esse anúncio. Confira o link ou use “Colar texto”.');
    }

    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Error('O link não abriu uma página de anúncio HTML.');
    const html = (await response.text()).slice(0, 2_000_000);
    const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || meta(html, 'og:title', 'twitter:title')).replace(/\s+/g, ' ').trim();
    const description = meta(html, 'og:description', 'description', 'twitter:description');
    const images = collectImages(html, current);
    const videoRaw = meta(html, 'og:video:secure_url', 'og:video', 'og:video:url', 'twitter:player:stream');
    let video = '';
    if (videoRaw) {
      try {
        const candidate = new URL(videoRaw, current);
        if (candidate.protocol === 'https:') video = candidate.toString();
      } catch {}
    }
    const body = html
      .replace(/<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    const text = decodeHtml(body).replace(/\s+/g, ' ').trim().slice(0, 12000);
    if (!title && !description && text.length < 80) {
      throw new Error('A página não disponibilizou dados suficientes. O site pode exigir JavaScript ou bloquear importações automáticas.');
    }

    return res.status(200).json({
      url: current.toString(),
      title,
      description,
      image: images[0] || '',
      images,
      video,
      text
    });
  } catch (error) {
    return res.status(400).json({
      error: error?.name === 'TimeoutError'
        ? 'A página demorou para responder. Tente novamente ou use “Colar texto”.'
        : error?.message || 'Falha ao ler o anúncio.'
    });
  }
}
