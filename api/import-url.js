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
    const url = new URL(decodeHtml(String(raw).replace(/\\\//g, '/').trim()), base);
    if (url.protocol !== 'https:' || url.href === new URL(base).href) return '';
    const path = decodeURIComponent(url.pathname + ' ' + url.search).toLowerCase();
    const bad = /(logo|avatar|icon|sprite|placeholder|loading|pixel|flag|bandeira|keyboard|arrow|eye|password|visibility|captcha|emoji|favicon|badge|arrowkeys|country-flag|brasil)/i;
    if (bad.test(path) || /\.(svg|gif|ico)(?:$|[?#])/i.test(path)) return '';
    return url.toString();
  } catch { return ''; }
}

function attr(tag, name) {
  return tag.match(new RegExp('\\b' + name + '\\s*=\\s*["\\x27]([^"\\x27]*)["\\x27]', 'i'))?.[1] || '';
}

function looksLikeUiImage(tag, raw) {
  const hints = [raw, attr(tag, 'alt'), attr(tag, 'title'), attr(tag, 'class'), attr(tag, 'id'), attr(tag, 'aria-label'), attr(tag, 'role'), attr(tag, 'data-testid')].join(' ').toLowerCase();
  return /(flag|bandeira|keyboard|arrow.?keys|arrow.?key|eye|password|visibility|show.?password|hide.?password|icon|logo|captcha|favicon|sprite|avatar|country.?br|brasil.?flag)/i.test(hints);
}

function collectImages(html, current) {
  const candidates = [];
  const seen = new Set();
  const rejected = new Set();
  const add = (raw, tag = '', source = 'page') => {
    if (!raw || looksLikeUiImage(tag, raw)) return;
    const url = absoluteImage(raw, current);
    if (!url || rejected.has(url) || seen.has(url)) return;
    const w = Number(attr(tag, 'width') || attr(tag, 'data-width') || 0);
    const h = Number(attr(tag, 'height') || attr(tag, 'data-height') || 0);
    const sizeHint = url.match(/[?&](?:width|w)=([0-9]{2,4})/i);
    const hintedWidth = sizeHint ? Number(sizeHint[1]) : 0;
    if ((w && w < 120) || (h && h < 100) || (w && h && w * h < 24000) || (hintedWidth && hintedWidth < 180)) return;
    let score = 0;
    const srcsetWidth = Number(attr(tag, 'data-original-width') || 0);
    if (w >= 600 || hintedWidth >= 600 || srcsetWidth >= 600) score += 4;
    if (h >= 400) score += 4;
    if (w >= 1000 || hintedWidth >= 1000 || srcsetWidth >= 1000) score += 3;
    if (/(large|original|full|high|gallery|photo|imovel|property|listing|image|foto)/i.test(url + ' ' + attr(tag, 'class'))) score += 2;
    if (/(thumb|small|mini|resize|tiny|low|150x|100x|thumbnail)/i.test(url)) score -= 4;
    if (source === 'og') score += 1;
    seen.add(url);
    candidates.push({url,score,order:candidates.length});
  };
  for (const key of ['og:image:secure_url','og:image','twitter:image','twitter:image:src']) {
    const value = meta(html,key);
    if (value) add(value,'','og');
  }
  const imageTags = html.match(/<(?:img|source)\b[^>]*>/gi) || [];
  for (const tag of imageTags) {
    if (looksLikeUiImage(tag, attr(tag,'src') || attr(tag,'data-src'))) {
      for (const name of ['data-src','data-original','data-lazy-src','data-image','data-full','data-zoom-image','src']) { const rejectedUrl=absoluteImage(attr(tag,name),current); if(rejectedUrl) rejected.add(rejectedUrl); }
      const rejectedSet=attr(tag,'srcset') || attr(tag,'data-srcset');
      for (const part of rejectedSet.split(',')) { const rejectedUrl=absoluteImage(part.trim().split(/\s+/)[0],current); if(rejectedUrl) rejected.add(rejectedUrl); }
      continue;
    }
    for (const name of ['data-src','data-original','data-lazy-src','data-image','data-full','data-zoom-image','src']) {
      const value = attr(tag,name);
      if (value) add(value,tag);
    }
    const srcset = attr(tag,'srcset') || attr(tag,'data-srcset');
    if (srcset) {
      const options = srcset.split(',').map(part=>part.trim()).map(part=>{
        const m=part.match(/^(\S+)\s+(\d+)(w|x)$/);
        return m?{url:m[1],size:Number(m[2])}:{url:part.split(/\s+/)[0],size:0};
      }).sort((x,y)=>y.size-x.size);
      for (const option of options.slice(0,3)) if(option.url) add(option.url,tag+' data-original-width="'+option.size+'"');
    }
  }
  // Algumas galerias deixam as fotos em JSON/scripts, sem tags <img> visíveis.
  const rawUrls = html.match(/https?:\\?\/\\?\/[^"' \t\r\n<>\\]+/gi) || [];
  for (const raw of rawUrls) {
    const cleaned = raw.replace(/\\u0026/gi,'&').replace(/\\\//g,'/').replace(/[),;]+$/,'');
    if (/\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(cleaned) || /(?:image|photo|foto|gallery|galeria|uploads?)[^?#]*[?&](?:width|w)=/i.test(cleaned)) add(cleaned,'');
  }
  return candidates.sort((a,b)=>b.score-a.score||a.order-b.order).map(x=>x.url);
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
    // Remove interface chrome before extracting text so the importer receives listing details, not page controls.
    let cleanedHtml = html
      .replace(/<(script|style|noscript|svg|iframe|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(nav|header|footer|aside|form|button|dialog)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    // TemporadaLivre repeats quote, availability and sharing UI inside generic containers.
    const uiContainer = /<(div|section|ul|ol)\b(?=[^>]*(?:class|id|role|aria-label|data-testid)\s*=\s*["'][^"']*(?:modal|share|favorite|favorit|contact|quote|availability|calendar|cookie|breadcrumb|social|menu|navbar|header|footer|related|recommend|login|newsletter|whatsapp|facebook|email|price-detail|price_detail|contactstate|propertystate|error-message)[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi;
    for (let i = 0; i < 5; i++) cleanedHtml = cleanedHtml.replace(uiContainer, ' ');
    const body = cleanedHtml
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    const text = decodeHtml(body)
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/(?:Copiar link|Remover dos favoritos|Adicionar aos favoritos|Compartilhar por e-mail|Enviar pelo Whatsapp|Compartilhar pelo Facebook|Pedir Orçamento!?|Ver Telefones|Aguarde\s*\.{3}|Clique aqui para (?:ver|confirmar|pedir)|Nº de (?:Adultos|Crianças)|Digite o nome da pessoa para quem quer enviar|Qual o e-mail dela\?|Seu nome:|Seu e-mail:|Preço e disponibilidade|Detalhamento do preço|Anunciante verificado pelo TemporadaLivre|Locação 100% garantida|Resposta Rápida!?)/gi, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 12000);
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
