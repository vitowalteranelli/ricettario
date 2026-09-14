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
const curatedImages = Object.fromEntries(Object.entries(manifest.images || {}).filter(([, media]) => media?.matchType !== 'suggested'));
const images = { ...curatedImages };
const concurrency = Math.max(1, Number(process.env.MEDIA_CONCURRENCY || 8));
const limit = Number(process.env.MEDIA_LIMIT || 0);
const requestTimeout = 12000;
const userAgent = 'Ricettario media batch/1.0';
const stopWords = new Set(['al', 'alla', 'alle', 'agli', 'ai', 'con', 'da', 'dei', 'del', 'della', 'delle', 'di', 'e', 'il', 'in', 'la', 'le', 'lo', 'per', 'un', 'una']);

function clean(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function significantTokens(value) {
  return [...new Set(clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length >= 3 && !stopWords.has(token)))];
}

function isRelevant(recipe, candidateText) {
  const wanted = significantTokens(recipe.title);
  const available = significantTokens(candidateText);
  if (!wanted.length) return false;
  const matches = wanted.filter((wantedToken) => available.some((availableToken) => (
    availableToken === wantedToken ||
    (wantedToken.length >= 5 && (availableToken.startsWith(wantedToken) || wantedToken.startsWith(availableToken)))
  )));
  return matches.length >= (wanted.length > 1 ? 2 : 1);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: controller.signal
      });
      if (response.status === 429 || response.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch {
      if (attempt === 2) return null;
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

function buildQueries(recipe) {
  return [String(recipe.title || '').trim()].filter(Boolean);
}

async function searchOpenverse(query) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.search = new URLSearchParams({
    q: query,
    page_size: '1',
    license: 'cc0,by,by-sa,by-nd'
  });
  const data = await requestJson(url);
  const result = data?.results?.[0];
  if (!result) return null;
  const candidateText = [result.title, ...(result.tags || []).map((tag) => tag.name)].join(' ');
  if (!isRelevant({ title: query }, candidateText)) return null;
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
    caption: 'Potrebbe non corrispondere esattamente alla ricetta.'
  };
}

async function searchWikimedia(query) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '1',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1280',
    format: 'json',
    origin: '*'
  });
  const data = await requestJson(url);
  const page = Object.values(data?.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  const metadata = info?.extmetadata || {};
  const candidateText = [
    page?.title,
    metadata.ObjectName?.value,
    metadata.ImageDescription?.value,
    metadata.Categories?.value
  ].join(' ');
  if (!info || info.mime === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(page?.title || '') || !isRelevant({ title: query }, candidateText)) return null;
  const imageUrl = httpUrl(info?.thumburl || info?.url);
  if (!imageUrl) return null;
  return {
    imageUrl,
    alt: `Immagine suggerita per ${query}`,
    credit: clean(info.extmetadata?.Artist?.value) || 'Wikimedia Commons',
    license: clean(info.extmetadata?.LicenseShortName?.value),
    licenseUrl: httpUrl(info.extmetadata?.LicenseUrl?.value),
    sourceUrl: httpUrl(info.descriptionurl),
    provider: 'Wikimedia Commons',
    matchType: 'suggested',
    caption: 'Potrebbe non corrispondere esattamente alla ricetta.'
  };
}

async function findMedia(recipe) {
  for (const query of buildQueries(recipe)) {
    const openverse = await searchOpenverse(query);
    if (openverse) return openverse;
  }
  for (const query of buildQueries(recipe)) {
    const wikimedia = await searchWikimedia(query);
    if (wikimedia) return wikimedia;
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
    description: 'Immagini illustrative curate o suggerite automaticamente; le immagini suggerite richiedono verifica.',
    provider: 'Openverse e Wikimedia Commons',
    images: orderedImages
  }, null, 4)}\n`);
}

async function main() {
  const pending = recipes.filter((recipe) => !images[recipe.id]).slice(0, limit || undefined);
  let completed = 0;
  let found = 0;
  let notFound = 0;
  let cursor = 0;

  console.log(`Ricette totali: ${recipes.length}. Da cercare: ${pending.length}. Concorrenza: ${concurrency}.`);

  async function worker() {
    while (true) {
      const recipe = pending[cursor++];
      if (!recipe) return;
      const media = await findMedia(recipe);
      if (media) {
        images[recipe.id] = media;
        found += 1;
      } else {
        notFound += 1;
      }
      completed += 1;
      if (completed % 25 === 0 || completed === pending.length) {
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
