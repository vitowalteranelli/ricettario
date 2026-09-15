#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'datasets', 'catalog.json');
const mediaPath = path.join(root, 'datasets', 'recipe-media.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
const recipes = catalog.sources.flatMap((source) => {
  const dataset = JSON.parse(fs.readFileSync(path.join(root, source.path), 'utf8'));
  return dataset.recipes;
});
const refreshSuggested = process.env.MEDIA_REFRESH_SUGGESTED === '1';
const revalidateWeb = process.env.MEDIA_REVALIDATE_WEB === '1';
const webOnly = process.env.MEDIA_WEB_ONLY === '1';
const sourceFilter = clean(process.env.MEDIA_SOURCE);
const images = refreshSuggested
  ? Object.fromEntries(Object.entries(manifest.images || {}).filter(([, media]) => media?.matchType !== 'suggested'))
  : { ...(manifest.images || {}) };
const recipeSourceById = new Map(recipes.map((recipe) => [recipe.id, recipe.sourceId]));
const revalidateIds = new Set(Object.entries(manifest.images || {})
  .filter(([recipeId, media]) => media?.extraction && (!sourceFilter || recipeSourceById.get(recipeId) === sourceFilter))
  .map(([recipeId]) => recipeId));
if (revalidateWeb) revalidateIds.forEach((recipeId) => delete images[recipeId]);
const concurrency = Math.max(1, Number(process.env.MEDIA_CONCURRENCY || 4));
const limit = Math.max(0, Number(process.env.MEDIA_LIMIT || 0));
const offset = Math.max(0, Number(process.env.MEDIA_OFFSET || 0));
const requestTimeout = 5000;
const recipeTimeout = 25000;
const idFilter = new Set(String(process.env.MEDIA_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
const userAgent = 'Ricettario media batch/2.0';
const searchCache = new Map();
const pageCache = new Map();
const stopWords = new Set([
  'al', 'alla', 'alle', 'agli', 'ai', 'con', 'da', 'dei', 'del', 'della', 'delle', 'di', 'e',
  'il', 'in', 'la', 'le', 'lo', 'per', 'un', 'una', 'uno', 'su', 'sul', 'sulla', 'ricetta',
  'ricette', 'recipe', 'food', 'cucina', 'italian', 'italiana', 'classico', 'classica'
]);
const ingredientStopWords = new Set([
  ...stopWords,
  'bustina', 'cucchiaio', 'cucchiai', 'cucchiaino', 'cucchiaini', 'fetta', 'fette', 'foglia',
  'foglie', 'grammi', 'litro', 'litri', 'rametto', 'rametti', 'spicchio', 'spicchi', 'tazza',
  'tazze', 'bicchiere', 'bicchieri', 'olio', 'sale', 'pepe', 'acqua', 'qb', 'quanto', 'basta',
  'ingredienti', 'procedimento'
]);
const searchAliases = new Map([
  ['asparagi', 'asparagus'], ['baccalà', 'salt cod'], ['carciofi', 'artichokes'],
  ['castagne', 'chestnuts'], ['cavolfiore', 'cauliflower'], ['ceci', 'chickpeas'],
  ['fagioli', 'beans'], ['funghi', 'mushrooms'], ['gamberi', 'shrimp'],
  ['lenticchie', 'lentils'], ['maiale', 'pork'], ['manzo', 'beef'],
  ['melanzane', 'eggplant aubergine'], ['patate', 'potatoes'], ['peperoni', 'bell pepper'],
  ['pesche', 'peaches'], ['pesce', 'fish'], ['pollo', 'chicken'], ['pomodori', 'tomatoes'],
  ['riso', 'rice'], ['salmone', 'salmon'], ['spinaci', 'spinach'], ['tacchino', 'turkey'],
  ['tonno', 'tuna'], ['uova', 'eggs'], ['vitello', 'veal'], ['zucchine', 'zucchini courgette']
]);
const regionTerms = new Map([
  ['abruzzo', ['abruzzo', 'abruzzese']], ['basilicata', ['basilicata', 'lucano', 'lucana']],
  ['calabria', ['calabria', 'calabrese']], ['campania', ['campania', 'campano', 'campana', 'napoletano', 'napoletana']],
  ['emilia-romagna', ['emilia', 'romagna', 'romagnolo', 'romagnola', 'bolognese', 'modenese']],
  ['friuli-venezia-giulia', ['friuli', 'giuliano', 'giuliana']], ['lazio', ['lazio', 'laziale', 'romano', 'romana']],
  ['liguria', ['liguria', 'ligure', 'genovese']], ['lombardia', ['lombardia', 'lombardo', 'milanese']],
  ['marche', ['marche', 'marchigiano', 'marchigiana']], ['molise', ['molise', 'molisano', 'molisana']],
  ['piemonte', ['piemonte', 'piemontese', 'torinese']], ['puglia', ['puglia', 'pugliese', 'barese']],
  ['sardegna', ['sardegna', 'sardo', 'sarda']], ['sicilia', ['sicilia', 'siciliano', 'siciliana']],
  ['toscana', ['toscana', 'toscano', 'toscana', 'fiorentino', 'fiorentina']],
  ['trentino-alto-adige', ['trentino', 'alto adige', 'sudtirolese']], ['umbria', ['umbria', 'umbro', 'umbra']],
  ['valle-d-aosta', ['valle d aosta', 'valdostano', 'valdostana']], ['veneto', ['veneto', 'veneziano', 'veneziana']]
]);

function clean(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripTags(value) {
  return clean(decodeHtml(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ')));
}

function httpUrl(value, base = '') {
  try {
    const url = new URL(String(value || '').trim(), base || undefined);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function normalizedText(value) {
  return clean(decodeHtml(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function significantTokens(value) {
  return [...new Set(normalizedText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopWords.has(token)))];
}

function tokensMatch(wantedToken, availableToken) {
  return availableToken === wantedToken || (
    wantedToken.length >= 5 && (
      availableToken.startsWith(wantedToken) || wantedToken.startsWith(availableToken)
    )
  );
}

function relevance(query, candidateText) {
  const wanted = significantTokens(query);
  const available = significantTokens(candidateText);
  const matches = wanted.filter((wantedToken) => available.some((availableToken) => tokensMatch(wantedToken, availableToken)));
  const exactMatches = matches.filter((wantedToken) => available.includes(wantedToken)).length;
  return {
    wanted,
    matches,
    score: matches.length + (exactMatches * 0.25)
  };
}

function isRelevant(query, candidateText, structured = false) {
  const result = relevance(query, candidateText);
  if (!result.wanted.length) return false;
  const requiredMatches = Math.min(2, result.wanted.length);
  if (result.matches.length >= requiredMatches) return true;
  return structured && result.matches.length === 1 && result.matches[0].length >= 6;
}

function isTitleFullyRelevant(query, candidateText) {
  const result = relevance(matchingTitle(query), candidateText);
  return result.wanted.length > 0 && result.matches.length === result.wanted.length;
}

function matchingTitle(value) {
  return clean(value).replace(/\(([^)]*)\)/g, (_, content) => {
    const normalized = normalizedText(content);
    if (/^(?:di|con|al|allo|alla|agli|ai|in|per|su|sul|sulla|e)\b/.test(normalized)) return ` ${content} `;
    return ' ';
  });
}

function regionKey(value) {
  const normalized = normalizedText(value);
  for (const [key, terms] of regionTerms) {
    if (terms.some((term) => normalized.includes(normalizedText(term)))) return key;
  }
  return '';
}

function hasConflictingRegion(recipe, candidate) {
  const localRegion = regionKey(recipe.sourceRegion);
  if (!localRegion) return false;
  const candidateContext = [candidate.name, candidate.recipe?.recipeCuisine, candidate.recipe?.keywords, candidate.recipe?.description].join(' ');
  const candidateRegion = regionKey(candidateContext);
  return Boolean(candidateRegion && candidateRegion !== localRegion);
}

function ingredientText(recipe) {
  const parts = [];
  function visit(sections) {
    (sections || []).forEach((section) => {
      const title = clean(section.title);
      if (/^ingredienti?\b/i.test(title)) {
        const mixedSection = /ingredienti.*procedimento|procedimento.*ingredienti/i.test(title);
        for (const item of section.items || []) {
          if (mixedSection && /^(?:nel|nella|nello|nelle|sulla|sul|sull['’]|con|versate|mettete|lasciate|disponete|pestate|aggiungete|preparate|tagliate|cuocete|fate|si gusta)\b/i.test(clean(item))) break;
          parts.push(item);
        }
      }
      visit(section.sections);
    });
  }
  visit(recipe.sections);
  return parts.join(' ');
}

function ingredientTokens(value) {
  return significantTokens(value).filter((token) => !ingredientStopWords.has(token) && !/^\d+$/.test(token));
}

function jsonIngredientText(value) {
  if (Array.isArray(value)) return value.map(jsonIngredientText).join(' ');
  if (value && typeof value === 'object') return [value.name, value.value].filter(Boolean).join(' ');
  return String(value || '');
}

function isWebRecipeRelevant(recipe, candidate) {
  const baseTitle = matchingTitle(recipe.title);
  const titleRelevance = relevance(baseTitle, candidate.name);
  if (isGenericRecipeTitle(candidate.name) || hasConflictingRegion(recipe, candidate)) return false;
  const candidateTitleTokens = significantTokens(candidate.name);
  const missingTitleTokens = titleRelevance.wanted.filter((wantedToken) => !candidateTitleTokens.some((availableToken) => tokensMatch(wantedToken, availableToken)));
  return titleRelevance.wanted.length > 0 && missingTitleTokens.length === 0;
}

function isGenericRecipeTitle(value) {
  return /\b(?:\d+\s+)?ricett[ae]\b|migliori ricette|cosa fare con|idee (?:gustose|facili)|ricette con\b|wikipedia|store ufficiale|proprietà|controindicazioni|alimento\b/i.test(clean(value));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestText(url, headers = {}, maxAttempts = 1) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'user-agent': userAgent,
          ...headers
        },
        signal: AbortSignal.timeout(requestTimeout)
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt + 1 >= maxAttempts) return null;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      return await response.text();
    } catch {
      if (attempt + 1 >= maxAttempts) return null;
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

async function requestJson(url) {
  const text = await requestText(url, { accept: 'application/json' }, 1);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function uniqueUrls(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const normalized = httpUrl(url);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function decodeBase64Url(value) {
  try {
    const normalized = String(value || '').slice(2).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function unwrapSearchUrl(value) {
  const raw = httpUrl(decodeHtml(value), 'https://www.bing.com');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const uddg = url.searchParams.get('uddg');
    if (uddg) return httpUrl(uddg);
    const encoded = url.searchParams.get('u');
    if (encoded?.startsWith('a1')) return httpUrl(decodeBase64Url(encoded));
    return raw;
  } catch {
    return '';
  }
}

function searchResultUrl(block) {
  const href = block.match(/\bhref\s*=\s*["']([^"']+)/i)?.[1];
  return href ? unwrapSearchUrl(href) : '';
}

function parseDuckDuckGoResults(html) {
  const blocks = html.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  return uniqueUrls(blocks.map(searchResultUrl)).slice(0, 10);
}

function parseBingResults(html) {
  const blocks = html.match(/<li\b[^>]*class=["'][^"']*b_algo[^"']*["'][\s\S]*?<\/li>/gi) || [];
  return uniqueUrls(blocks.map((block) => {
    const heading = block.match(/<h2\b[\s\S]*?<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0] || block;
    return searchResultUrl(heading);
  })).slice(0, 10);
}

async function searchDuckDuckGo(query) {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.search = new URLSearchParams({ q: query, kl: 'it-it' });
  const html = await requestText(url.href, {}, 1);
  return html ? parseDuckDuckGoResults(html) : [];
}

async function searchBing(query) {
  const url = new URL('https://www.bing.com/search');
  url.search = new URLSearchParams({ q: query, count: '10', setlang: 'it-it' });
  const html = await requestText(url.href, {}, 1);
  return html ? parseBingResults(html) : [];
}

async function searchWeb(query) {
  if (!searchCache.has(query)) {
    searchCache.set(query, Promise.all([searchBing(query), searchDuckDuckGo(query)])
      .then(([bing, duckDuckGo]) => uniqueUrls([...bing, ...duckDuckGo]).slice(0, 4))
      .catch(() => []));
  }
  return searchCache.get(query);
}

function buildSearchQueries(recipe) {
  const title = clean(recipe.title);
  if (!title) return [];
  const region = clean(recipe.sourceRegion);
  const queries = [region ? `${title} ${region} ricetta` : `${title} ricetta`];
  if (region) queries.push(`${title} ricetta`);
  const aliasTitle = title.replace(/\b[\p{L}]+\b/gu, (token) => searchAliases.get(token.toLocaleLowerCase('it-IT')) || token);
  if (aliasTitle !== title) queries.push(`${aliasTitle} recipe`);
  return [...new Set(queries)];
}

function buildImageQueries(recipe) {
  const title = clean(recipe.title);
  if (!title) return [];
  const queries = [title];
  const aliasTitle = title.replace(/\b[\p{L}]+\b/gu, (token) => searchAliases.get(token.toLocaleLowerCase('it-IT')) || token);
  if (aliasTitle !== title) queries.push(aliasTitle);
  return [...new Set(queries)];
}

function extractMetaTags(html) {
  const metadata = {};
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  tags.forEach((tag) => {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) attrs[match[1].toLocaleLowerCase()] = decodeHtml(match[3]);
    const key = attrs.property || attrs.name;
    if (key && attrs.content) metadata[key.toLocaleLowerCase()] = attrs.content.trim();
  });
  return metadata;
}

function jsonLdScripts(html) {
  return (html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [])
    .map((script) => script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim())
    .map((value) => decodeHtml(value).replace(/^<!--|-->$/g, '').trim())
    .map((value) => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function recipeNodes(value, result = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => recipeNodes(item, result));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some((type) => String(type).toLocaleLowerCase().endsWith('recipe'))) result.push(value);
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') recipeNodes(child, result);
  });
  return result;
}

function imageUrls(value, result = []) {
  if (typeof value === 'string') result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => imageUrls(item, result));
  else if (value && typeof value === 'object') {
    ['url', 'contentUrl', 'thumbnailUrl'].forEach((key) => {
      if (value[key]) imageUrls(value[key], result);
    });
  }
  return result;
}

function pageTitle(html) {
  return clean(decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''));
}

function parseRecipePage(html, pageUrl) {
  const metadata = extractMetaTags(html);
  const recipesFromJsonLd = jsonLdScripts(html).flatMap((value) => recipeNodes(value));
  const recipes = recipesFromJsonLd.map((recipe) => ({
    name: clean(recipe.name),
    imageUrl: uniqueUrls(imageUrls(recipe.image).map((url) => httpUrl(url, pageUrl)))[0] || '',
    recipe
  })).filter((recipe) => recipe.name && recipe.imageUrl);
  const text = normalizedText(stripTags(html).slice(0, 600000));
  return {
    title: pageTitle(html),
    ogTitle: clean(metadata['og:title'] || metadata['twitter:title']),
    ogImage: httpUrl(metadata['og:image'] || metadata['twitter:image'], pageUrl),
    recipes,
    hasRecipeSignals: /ingredienti|preparazione|procedimento|recipe ingredient|recipe instructions/.test(text)
  };
}

async function fetchRecipePage(pageUrl) {
  if (!pageCache.has(pageUrl)) {
    pageCache.set(pageUrl, (async () => {
      const html = await requestText(pageUrl, { accept: 'text/html,application/xhtml+xml;q=0.9' }, 1);
      return html ? parseRecipePage(html, pageUrl) : null;
    })().catch(() => null));
  }
  return pageCache.get(pageUrl);
}

function canFetchPage(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (/\.(?:pdf|docx?|xlsx?|zip)(?:$|[?#])/i.test(url.pathname)) return false;
    if (/(?:\/ricette\/(?:ricetta-per|ricette-)|\/ricette\/?$)/i.test(url.pathname)) return false;
    return !/(?:google|bing|duckduckgo|facebook|instagram|pinterest|youtube|tiktok|wikipedia)\./i.test(url.hostname);
  } catch {
    return false;
  }
}

function looksLikeImage(imageUrl) {
  return Boolean(imageUrl) && !/(?:logo|favicon|avatar|sprite|placeholder|tracking|pixel|banner|icon)/i.test(imageUrl);
}

function webMedia(recipe, pageUrl, parsed, candidate, extraction, query) {
  const domain = new URL(pageUrl).hostname.replace(/^www\./i, '');
  const score = relevance(recipe.title, candidate.name || parsed.ogTitle || parsed.title).score;
  return {
    imageUrl: candidate.imageUrl,
    alt: `Immagine suggerita per ${recipe.title}`,
    credit: '',
    license: 'Da verificare',
    licenseUrl: '',
    sourceUrl: pageUrl,
    provider: `Pagina ricetta · ${domain}`,
    matchType: 'suggested',
    matchScore: Number(score.toFixed(2)),
    searchQuery: query,
    extraction,
    pageTitle: candidate.name || parsed.ogTitle || parsed.title,
    caption: 'Immagine trovata su una pagina ricetta; verifica corrispondenza e diritti d’uso.'
  };
}

async function findWebMedia(recipe) {
  for (const query of buildSearchQueries(recipe)) {
    const pages = await searchWeb(query);
    for (let index = 0; index < pages.length; index += 4) {
      const pageBatch = pages.slice(index, index + 4).filter(canFetchPage);
      const parsedPages = await Promise.all(pageBatch.map(async (pageUrl) => ({
        pageUrl,
        parsed: await fetchRecipePage(pageUrl)
      })));
      const matches = [];
      parsedPages.forEach(({ pageUrl, parsed }) => {
        if (!parsed) return;
        const structured = parsed.recipes
          .filter((candidate) => looksLikeImage(candidate.imageUrl) && isWebRecipeRelevant(recipe, candidate))
          .sort((left, right) => relevance(recipe.title, right.name).score - relevance(recipe.title, left.name).score)[0];
        if (structured) {
          matches.push({ pageUrl, parsed, candidate: structured, extraction: 'recipe-jsonld' });
          return;
        }
        const fallbackTitle = parsed.ogTitle || parsed.title;
      const pagePath = new URL(pageUrl).pathname;
      const recipePageHint = /ricett|recipe|cucin|piatt[oi]/i.test(`${pagePath} ${fallbackTitle}`);
        if (parsed.ogImage && parsed.hasRecipeSignals && recipePageHint && !isGenericRecipeTitle(fallbackTitle) && looksLikeImage(parsed.ogImage) && isTitleFullyRelevant(recipe.title, fallbackTitle)) {
          matches.push({ pageUrl, parsed, candidate: { imageUrl: parsed.ogImage, name: fallbackTitle }, extraction: 'og:image' });
        }
      });
      matches.sort((left, right) => relevance(recipe.title, right.candidate.name).score - relevance(recipe.title, left.candidate.name).score);
      if (matches[0]) {
        const match = matches[0];
        return webMedia(recipe, match.pageUrl, match.parsed, match.candidate, match.extraction, query);
      }
    }
  }
  return null;
}

function openverseCandidate(result, query, score) {
  const imageUrl = httpUrl(result.url || result.thumbnail);
  if (!imageUrl) return null;
  const license = [clean(result.license), clean(result.license_version)].filter(Boolean).join(' ').toUpperCase();
  return {
    imageUrl,
    alt: `Immagine suggerita per ${query}`,
    credit: clean(result.creator) || clean(result.attribution) || clean(result.provider) || 'Openverse',
    license,
    licenseUrl: httpUrl(result.license_url),
    sourceUrl: httpUrl(result.foreign_landing_url || result.detail_url),
    provider: `Openverse · ${clean(result.provider)}`,
    matchType: 'suggested',
    matchScore: Number(score.toFixed(2)),
    searchQuery: query,
    caption: 'Potrebbe non corrispondere esattamente alla ricetta.'
  };
}

async function searchOpenverse(query) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.search = new URLSearchParams({ q: query, page_size: '8', license: 'cc0,by,by-sa,by-nd' });
  const data = await requestJson(url);
  const candidates = (data?.results || []).map((result) => {
    const candidateText = [result.title, ...(result.tags || []).map((tag) => tag.name || tag)].join(' ');
    const score = relevance(query, candidateText).score;
    return isRelevant(query, candidateText) ? { result, score } : null;
  }).filter(Boolean).sort((left, right) => right.score - left.score);
  const best = candidates[0];
  return best ? openverseCandidate(best.result, query, best.score) : null;
}

async function searchWikimedia(query) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '5',
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1280', format: 'json', origin: '*'
  });
  const data = await requestJson(url);
  for (const page of Object.values(data?.query?.pages || {})) {
    const info = page?.imageinfo?.[0];
    const metadata = info?.extmetadata || {};
    const candidateText = [page?.title, metadata.ObjectName?.value].join(' ');
    const score = relevance(query, candidateText).score;
    if (!info || info.mime === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(page?.title || '') || !isRelevant(query, candidateText)) continue;
    const imageUrl = httpUrl(info.thumburl || info.url);
    if (!imageUrl) continue;
    return {
      imageUrl,
      alt: `Immagine suggerita per ${query}`,
      credit: clean(metadata.Artist?.value) || 'Wikimedia Commons',
      license: clean(metadata.LicenseShortName?.value),
      licenseUrl: httpUrl(metadata.LicenseUrl?.value),
      sourceUrl: httpUrl(info.descriptionurl),
      provider: 'Wikimedia Commons',
      matchType: 'suggested',
      matchScore: Number(score.toFixed(2)),
      searchQuery: query,
      caption: 'Potrebbe non corrispondere esattamente alla ricetta.'
    };
  }
  return null;
}

async function findMedia(recipe) {
  const web = await findWebMedia(recipe);
  if (web) return web;
  if (revalidateWeb || webOnly) return null;
  for (const query of buildImageQueries(recipe)) {
    const openverse = await searchOpenverse(query);
    if (openverse) return { ...openverse, alt: `Immagine suggerita per ${recipe.title}` };
  }
  for (const query of buildImageQueries(recipe)) {
    const wikimedia = await searchWikimedia(query);
    if (wikimedia) return { ...wikimedia, alt: `Immagine suggerita per ${recipe.title}` };
  }
  return null;
}

function saveManifest() {
  const orderedImages = {};
  recipes.forEach((recipe) => {
    if (images[recipe.id]) orderedImages[recipe.id] = images[recipe.id];
  });
  Object.entries(images).forEach(([recipeId, media]) => {
    if (!orderedImages[recipeId]) orderedImages[recipeId] = media;
  });
  fs.writeFileSync(mediaPath, `${JSON.stringify({
    ...manifest,
    description: 'Immagini illustrative curate o suggerite da pagine ricetta, Openverse e Wikimedia Commons; le immagini suggerite richiedono verifica.',
    provider: 'Pagine ricetta, Openverse e Wikimedia Commons',
    images: orderedImages
  }, null, 4)}\n`);
}

function findMediaWithTimeout(recipe) {
  return Promise.race([
    findMedia(recipe),
    new Promise((resolve) => setTimeout(() => resolve(null), recipeTimeout))
  ]);
}

async function main() {
  const candidates = recipes.filter((recipe) => {
    if (sourceFilter && recipe.sourceId !== sourceFilter) return false;
    if (idFilter.size && !idFilter.has(recipe.id)) return false;
    if (revalidateWeb) return revalidateIds.has(recipe.id);
    return !images[recipe.id];
  });
  const pending = candidates.slice(offset, limit ? offset + limit : undefined);
  let completed = 0;
  let found = 0;
  let notFound = 0;
  let cursor = 0;

  console.log(`Ricette totali: ${recipes.length}. Da cercare: ${pending.length}${sourceFilter ? ` (${sourceFilter})` : ''}. Offset: ${offset}. Concorrenza: ${concurrency}.`);

  async function worker() {
    while (true) {
      const recipe = pending[cursor++];
      if (!recipe) return;
      const media = await findMediaWithTimeout(recipe);
      if (media) {
        images[recipe.id] = media;
        found += 1;
      } else {
        notFound += 1;
      }
      completed += 1;
      if (completed % 10 === 0 || completed === pending.length) {
        saveManifest();
        console.log(`${completed}/${pending.length} · trovate ${found} · senza risultato ${notFound}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  saveManifest();
  console.log(`Completato. Nuove immagini: ${found}. Senza risultato: ${notFound}. Manifest: ${mediaPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
