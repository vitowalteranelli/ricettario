#!/usr/bin/env node

/*
 * Importa il testo pagina per pagina della fonte “Ricette regionali” in un
 * dataset separato. La trascrizione è stata sottoposta a correzioni OCR
 * esclusivamente univoche da tools/correct-regional-transcription.js; il JSON
 * ricompone il testo in paragrafi leggibili e registra l'intervallo della
 * trascrizione da cui ogni ricetta è stata ricavata. La trascrizione fedele
 * resta nel file Markdown sorgente.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourceId = 'ricette-regionali';
const sourceName = 'Ricette regionali';
const sourcePath = path.join(repositoryRoot, 'output', 'cucina-regionale-italiana-5000-ricette.md');
const destinationPath = path.join(repositoryRoot, 'datasets', `${sourceId}.json`);
const bodyFirstPage = 13;
const bodyLastPage = 1489;
const indexFirstPage = 1606;
const indexLastPage = 1695;
const alphabeticalRegionIndexFirstPage = 1563;
const alphabeticalRegionIndexLastPage = 1605;
const plateFirstPage = 799;
const plateLastPage = 894;

const inlineRegions = [
    'Abruzzo',
    'Abruzzo-Molise',
    'Abruzzo - Molise',
    'Abruzzo – Molise',
    'Abruzzo–Molise',
    'Basilicata',
    'Calabria',
    'Campania',
    'Canpania',
    'Emilia-Romagna',
    'Friuli-Venezia Giulia',
    'Friuli- Venezia Giulia',
    'Friuli Venezia Giulia',
    'Friuli-Venezio Giulia',
    'Lazio',
    'Liguria',
    'Lombardia',
    'Marche',
    'Molise',
    'Piemonte',
    'Puglia',
    'Sardegna',
    'Sicilia',
    'Toscana',
    'Trentino-Alto Adige',
    'Trentino- Alto Adige',
    'Umbria',
    'Valle d’Aosta',
    "Valle d'Aosta",
    'Veneto',
    // Varianti OCR osservate nei titoli del documento.
    'Yrentino-Alto Adige',
    'Zrentino-Alto Adige',
    'rentino - Alto Adige',
    'Venero',
    'Vereto',
    'Busilicata',
    'Zoscana',
    // Varianti OCR osservate nell’indice alfabetico.
    'Calabra',
    'Calubria',
    'Frixli- Venezia Giulia',
    'Fiuli',
    'Fiuli-Venezia Giulia',
    'Friuli - Venezia Giulia',
    'Friuli -Venezia Giulia',
    'Friuli- Venezia Giulia',
    'Trenzino-Alto Adige',
    'Trenrino-Alto Adige',
    'Frentino-Alto Adige',
    'Enmilia-Romagna',
    'Emilia- Romagna',
    'Emilia-Romagua',
    'Piemonre',
    'Piemontze',
    'Marchel',
    'oscana',
    'Vennero',
    'Abruzzo-Motise',
    'Valle d\'Aosta'
];

const categoryHeadings = new Map([
    ['CONDIMENTI', 'CONDIMENTI, SALSE, SUGHI'],
    ['CONDIMENTI SALSE SUGHI', 'CONDIMENTI, SALSE, SUGHI'],
    ['PANI FOCACCE TORTE', 'PANI, FOCACCE, TORTE'],
    ['ANTIPASTI', 'ANTIPASTI, FORMAGGI E SALUMI'],
    ['ANTIPASTI FORMAGGI E SALUMI', 'ANTIPASTI, FORMAGGI E SALUMI'],
    ['PRIMI PIATTI', 'PRIMI PIATTI'],
    ['SECONDI PIATTI', 'SECONDI PIATTI'],
    ['CONTORNI E VERDURE', 'CONTORNI E VERDURE'],
    ['VERDURE', 'CONTORNI E VERDURE'],
    ['DOLCI E FRUTTA', 'DOLCI E FRUTTA']
]);

const subcategoryHeadings = new Map([
    ['PASTA FRESCA E GNOCCHI', 'PASTA FRESCA E GNOCCHI'],
    ['PASTA SECCA', 'PASTA SECCA'],
    ['BRODI MINESTRE E ZUPPE', 'BRODI, MINESTRE E ZUPPE'],
    ['POLENTA E RISO', 'POLENTA E RISO'],
    ['PESCI', 'PESCI'],
    ['CROSTACEI FRUTTI DI MARE MOLLUSCHI RANE E LUMACHE', 'CROSTACEI, FRUTTI DI MARE, MOLLUSCHI, RANE E LUMACHE'],
    ['CARNI BOVINE MAIALE CAVALLO SOMARO', 'CARNI BOVINE, MAIALE, CAVALLO, SOMARO'],
    ['CARNI BOVINE MAJALE CAVALLO SOMARO', 'CARNI BOVINE, MAJALE, CAVALLO, SOMARO'],
    ['CARNI OVINE', 'CARNI OVINE'],
    ['VOLATILI DA CORTILE E CONIGLIO', 'VOLATILI DA CORTILE E CONIGLIO'],
    ['SELVAGGINA', 'SELVAGGINA'],
    ['INTERIORA E FRATTAGLIE', 'INTERIORA E FRATTAGLIE'],
    ['UOVA E FRITTI', 'UOVA E FRITTI']
]);

function normalizeForMatch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const canonicalRegions = [
    'Abruzzo',
    'Abruzzo-Molise',
    'Basilicata',
    'Calabria',
    'Campania',
    'Emilia-Romagna',
    'Friuli-Venezia Giulia',
    'Lazio',
    'Liguria',
    'Lombardia',
    'Marche',
    'Molise',
    'Piemonte',
    'Puglia',
    'Sardegna',
    'Sicilia',
    'Toscana',
    'Trentino-Alto Adige',
    'Umbria',
    'Valle d’Aosta',
    'Veneto'
];

const regionAliases = new Map([
    ['abruzzo molise', 'Abruzzo-Molise'],
    ['abruzzo motise', 'Abruzzo-Molise'],
    ['friuli venezia giulia', 'Friuli-Venezia Giulia'],
    ['friuli venezio giulia', 'Friuli-Venezia Giulia'],
    ['friuli friuli venezia giulia', 'Friuli-Venezia Giulia'],
    ['friuli', 'Friuli-Venezia Giulia'],
    ['fiuli', 'Friuli-Venezia Giulia'],
    ['frixli venezia giulia', 'Friuli-Venezia Giulia'],
    ['trentino alto adige', 'Trentino-Alto Adige'],
    ['trenzino alto adige', 'Trentino-Alto Adige'],
    ['trenrino alto adige', 'Trentino-Alto Adige'],
    ['frentino alto adige', 'Trentino-Alto Adige'],
    ['yrentino alto adige', 'Trentino-Alto Adige'],
    ['zrentino alto adige', 'Trentino-Alto Adige'],
    ['rentino alto adige', 'Trentino-Alto Adige'],
    ['veneto', 'Veneto'],
    ['venero', 'Veneto'],
    ['vereto', 'Veneto'],
    ['vennero', 'Veneto'],
    ['basilicata', 'Basilicata'],
    ['busilicata', 'Basilicata'],
    ['toscana', 'Toscana'],
    ['zoscana', 'Toscana'],
    ['oscana', 'Toscana'],
    ['calabria', 'Calabria'],
    ['calabra', 'Calabria'],
    ['calubria', 'Calabria'],
    ['canpania', 'Campania'],
    ['emilia romagna', 'Emilia-Romagna'],
    ['emilia romagua', 'Emilia-Romagna'],
    ['enmilia romagna', 'Emilia-Romagna'],
    ['piemonte', 'Piemonte'],
    ['piemonre', 'Piemonte'],
    ['piemontze', 'Piemonte'],
    ['marche', 'Marche'],
    ['marchel', 'Marche'],
    ['valle daosta', 'Valle d’Aosta']
]);

for (const region of canonicalRegions) regionAliases.set(normalizeForMatch(region), region);

function canonicalizeRegion(value) {
    const normalized = normalizeForMatch(value);
    return regionAliases.get(normalized) || String(value || '').trim();
}

function normalizeHeading(value) {
    return normalizeForMatch(value).toUpperCase();
}

function slugify(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’‘']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function isTitleCaseLine(value) {
    return /^(?:\p{Lu}|[“‘"«])/u.test(value);
}

function isExcludedHeading(value) {
    const normalized = normalizeForMatch(value);
    return normalized === 'ricette regionali'
        || normalized === 'specialita regionali'
        || normalized === 'vino consigliato'
        || normalized.startsWith('vino consigliato ');
}

function isStandaloneRegion(value) {
    if (/[.,:;!?]$/.test(String(value || '').trim())) return false;
    const normalized = normalizeForMatch(value);
    return new Set(inlineRegions.map(normalizeForMatch)).has(normalized);
}

function parseDocument(lines) {
    let page = 0;
    return lines.map((raw, index) => {
        const pageMatch = raw.match(/^<!-- PDF page (\d{4}) \|/);
        if (pageMatch) page = Number(pageMatch[1]);
        return {
            index,
            page,
            raw: raw.replace(/\s+$/, ''),
            trimmed: raw.trim(),
            isPageMarker: Boolean(pageMatch)
        };
    });
}

function dehyphenateIndexText(value) {
    return String(value || '')
        .replace(/([\p{L}])-\s+(?=[\p{Ll}])/gu, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function addRegionalIndexEntry(entries, title, region, printedPage, pdfPage) {
    const normalizedTitle = normalizeForMatch(title);
    if (!normalizedTitle || isExcludedHeading(title)) return;
    if (!entries.has(normalizedTitle)) entries.set(normalizedTitle, []);
    entries.get(normalizedTitle).push({
        region: canonicalizeRegion(region),
        printedPage: Number(printedPage),
        pdfPage
    });
}

function parseRegionalIndex(documentLines) {
    const titleSet = new Set();
    const regionEntries = new Map();
    for (const line of documentLines) {
        if (line.page < indexFirstPage || line.page > indexLastPage) continue;
        const match = line.trimmed.match(/^(.+),\s*(\d{1,4})$/);
        if (!match) continue;
        const title = match[1].trim();
        if (title.length <= 2 || !isTitleCaseLine(title) || /[.,:;]$/.test(title)) continue;
        titleSet.add(normalizeForMatch(title));
    }

    // Nelle pagine immediatamente precedenti all’indice per titolo, il libro
    // riporta la stessa voce con regione e pagina. Le voci spezzate su più
    // righe vengono ricomposte prima del match; il testo resta comunque
    // quello trascritto dall’indice, senza completamenti interpretativi.
    const indexRegionAlternatives = [...new Set(inlineRegions)]
        .sort((left, right) => right.length - left.length)
        .map((region) => region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const indexRegionPattern = new RegExp(
        `^(.+?)(?:,|\\.)?\\s*(${indexRegionAlternatives})\\s*(?:,|\\.)+\\s*(\\d{1,4})$`,
        'i'
    );
    const canonicalRegionAlternatives = canonicalRegions
        .slice()
        .sort((left, right) => right.length - left.length)
        .map((region) => region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const canonicalRegionPattern = new RegExp(
        `^(.+?)(?:,|\\.)?\\s*(${canonicalRegionAlternatives})\\s*(?:,|\\.)+\\s*(\\d{1,4})$`,
        'i'
    );
    let block = [];
    let blockPage = 0;

    function flushBlock() {
        if (!block.length) return;
        // Alcune righe dell’indice sono consecutive senza una riga vuota;
        // altre voci sono invece spezzate su due o tre righe. Proviamo ogni
        // posizione con la finestra minima che produce una voce valida.
        for (let start = 0; start < block.length; start += 1) {
            for (let length = 1; length <= 3 && start + length <= block.length; length += 1) {
                const joined = dehyphenateIndexText(block.slice(start, start + length).join(' '));
                // Prefer the canonical spelling when a variant is also a
                // possible part of the title (for example “alla calabra”).
                const match = joined.match(canonicalRegionPattern) || joined.match(indexRegionPattern);
                if (!match) continue;
                const title = match[1].replace(/[, ]+$/, '').trim();
                addRegionalIndexEntry(regionEntries, title, match[2], match[3], blockPage);
                titleSet.add(normalizeForMatch(title));
                break;
            }
        }
        block = [];
    }

    for (const line of documentLines) {
        if (line.page !== blockPage) {
            flushBlock();
            blockPage = line.page;
        }
        if (line.page < alphabeticalRegionIndexFirstPage || line.page > alphabeticalRegionIndexLastPage) {
            flushBlock();
            continue;
        }
        if (!line.trimmed) {
            flushBlock();
            continue;
        }
        block.push(line.trimmed);
    }
    flushBlock();

    return { titleSet, regionEntries };
}

function buildRegionPatterns() {
    const escaped = [...new Set(inlineRegions)]
        .sort((left, right) => right.length - left.length)
        .map((region) => region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const alternatives = escaped.join('|');
    return [
        new RegExp(`^(.*?)\\s+(${alternatives})$`, 'i'),
        new RegExp(`^(.*?)\\s*[—–]\\s*(${alternatives})$`, 'i'),
        new RegExp(`^(.*?)\\s+-\\s+(${alternatives})$`, 'i')
    ];
}

function matchInlineRegion(value, regionPatterns) {
    for (const regionPattern of regionPatterns) {
        const inlineMatch = value.match(regionPattern);
        if (!inlineMatch) continue;
        const title = inlineMatch[1].trim().replace(/[—–-]\s*$/, '').trim();
        // In questo titolo “calabra” è l'aggettivo della ricetta, non una
        // regione separata: la regione è dichiarata dalla voce dell'indice.
        if (normalizeForMatch(inlineMatch[2]) === 'calabra' && /\balla$/i.test(title)) continue;
        if (title) return { title, region: inlineMatch[2] };
    }
    return null;
}

function findCandidate(line, regionalIndexTitles, regionPatterns) {
    const value = line.trimmed;
    if (!value || value.length <= 2 || isExcludedHeading(value)) return null;

    const inlineMatch = matchInlineRegion(value, regionPatterns);
    if (inlineMatch && isTitleCaseLine(inlineMatch.title)) {
        const normalizedTitle = normalizeForMatch(inlineMatch.title);
        if (normalizedTitle.startsWith('ricetta del ') || normalizedTitle.startsWith('ricetta della ')) return null;
        return { ...inlineMatch, detection: 'inline-region' };
    }

    if (!isTitleCaseLine(value) || /[.,:;]$/.test(value)) return null;
    if (!regionalIndexTitles.has(normalizeForMatch(value))) return null;
    return { title: value, region: '', detection: 'regional-index-title' };
}

function findWrappedInlineCandidate(documentLines, lineIndex, regionPatterns) {
    const line = documentLines[lineIndex];
    const value = line.trimmed;
    if (!value || !isTitleCaseLine(value) || /[.,:;!?]$/.test(value)) return null;

    let regionIndex = lineIndex + 1;
    while (regionIndex < documentLines.length && !documentLines[regionIndex].trimmed) regionIndex += 1;
    const regionLine = documentLines[regionIndex];
    if (!regionLine || regionLine.page !== line.page) return null;
    const inlineMatch = matchInlineRegion(regionLine.trimmed, regionPatterns);
    if (!inlineMatch) return null;

    const openingParentheses = (value.match(/\(/g) || []).length;
    const closingParentheses = (value.match(/\)/g) || []).length;
    const continuationIsParenthetical = /^\(/.test(inlineMatch.title);
    const continuationClosesHeading = /\)$/.test(inlineMatch.title) && openingParentheses > closingParentheses;
    if (!continuationIsParenthetical && !continuationClosesHeading) return null;

    let contentIndex = regionIndex + 1;
    while (contentIndex < documentLines.length && !documentLines[contentIndex].trimmed) contentIndex += 1;
    const contentLine = documentLines[contentIndex];
    if (!contentLine || contentLine.page !== line.page) return null;

    let previousIndex = lineIndex - 1;
    let followsWineRecommendation = false;
    for (let steps = 0; previousIndex >= 0 && steps < 4; previousIndex -= 1) {
        if (!documentLines[previousIndex].trimmed) continue;
        steps += 1;
        if (/^vino consigliato\s*:/i.test(documentLines[previousIndex].trimmed)) {
            followsWineRecommendation = true;
            break;
        }
    }
    const startsWithIngredients = /^ingredienti(?:\s+.*)?\s*:?[ \t]*$/i.test(contentLine.trimmed);
    if (!followsWineRecommendation && !startsWithIngredients) return null;

    return {
        title: `${value} ${inlineMatch.title}`.replace(/\s+/g, ' ').trim(),
        region: inlineMatch.region,
        detection: 'wrapped-inline-region',
        regionLineIndex: regionIndex,
        headingText: `${value} ${regionLine.trimmed}`.replace(/\s+/g, ' ').trim()
    };
}

function findContextualCandidate(documentLines, lineIndex, regionalIndexTitles, regionPatterns) {
    const line = documentLines[lineIndex];
    const candidate = findCandidate(line, regionalIndexTitles, regionPatterns);
    const wrappedCandidate = findWrappedInlineCandidate(documentLines, lineIndex, regionPatterns);
    if (wrappedCandidate) return { ...(candidate || {}), ...wrappedCandidate };

    const value = line.trimmed;
    if (!value || !isTitleCaseLine(value) || /[.,:;!?]$/.test(value)) return candidate;
    if (isExcludedHeading(value)) return null;

    let regionIndex = lineIndex + 1;
    while (regionIndex < documentLines.length && !documentLines[regionIndex].trimmed) regionIndex += 1;
    const regionLine = documentLines[regionIndex];
    if (!regionLine || regionLine.page !== line.page || !isStandaloneRegion(regionLine.trimmed)) return candidate;

    let contentIndex = regionIndex + 1;
    while (contentIndex < documentLines.length && !documentLines[contentIndex].trimmed) contentIndex += 1;
    const contentLine = documentLines[contentIndex];
    if (!contentLine || contentLine.page !== line.page) return candidate;
    if (!/^ingredienti(?:\s+.*)?\s*:?[ \t]*$/i.test(contentLine.trimmed)) return candidate;

    return {
        ...(candidate || { title: value, detection: 'contextual-region-heading' }),
        region: regionLine.trimmed,
        regionLineIndex: regionIndex
    };
}

function buildRegionTokenPattern() {
    const alternatives = [...new Set(inlineRegions)]
        .sort((left, right) => right.length - left.length)
        .map((region) => region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    return new RegExp(`(?<![\\p{L}])(${alternatives})(?![\\p{L}])`, 'giu');
}

function extractExplicitRegions(texts, regionTokenPattern) {
    const regions = [];
    for (const text of texts) {
        const searchable = String(text || '').replace(/\bvino consigliato\s*:.*$/i, '');
        regionTokenPattern.lastIndex = 0;
        for (const match of searchable.matchAll(regionTokenPattern)) {
            const region = canonicalizeRegion(match[1]);
            if (canonicalRegions.includes(region) && !regions.includes(region)) regions.push(region);
        }
    }
    return regions;
}

const geographicCuePattern = /\b(?:provincia|province|zona|zone|area|aree|territorio|territori|comune|comuni|città|citta|località|localita|specialità|specialita|produzione|produzioni|originari[oa]|origine|riviera|valle|vallata|monte|monti|lago|laghi|isola|isole|costiera|paese|paesi|borgo|borghi|alpeggio|alpeggi|sponda|sponde|versante|golfo|arcipelago)\b/i;

function extractGeographicReferences(notes, sections) {
    const texts = [
        ...(notes || []),
        ...(sections || []).flatMap((section) => section.items || [])
    ];
    return [...new Set(texts
        .map((text) => String(text || '').trim())
        .filter((text) => text && !/^vino consigliato\s*:/i.test(text) && geographicCuePattern.test(text)))];
}

function findBodyBeforeHeading(documentLines, previousCandidate, candidate) {
    if (!previousCandidate) return null;

    let wineIndex = -1;
    for (let index = previousCandidate.index + 1; index < candidate.index; index += 1) {
        if (/^vino consigliato\s*:/i.test(documentLines[index].trimmed)) wineIndex = index;
    }
    if (wineIndex < 0) return null;

    let nonEmptyLines = 0;
    for (let index = wineIndex + 1; index < candidate.index && nonEmptyLines < 8; index += 1) {
        const value = documentLines[index].trimmed;
        if (!value) continue;
        if (isStandaloneRegion(value)) {
            const paragraphs = splitParagraphs(documentLines.slice(index + 1, candidate.index));
            if (!paragraphs.length) return null;
            return { regionIndex: index, region: value, paragraphs };
        }
        nonEmptyLines += 1;
    }
    return null;
}

function isStructuralLine(value) {
    if (!value) return true;
    if (/^<!-- PDF page \d{4} \|/.test(value)) return true;
    if (/^\d{3,4}$/.test(value)) return true;
    const normalized = normalizeForMatch(value);
    if (normalized === 'ricette regionali' || normalized === 'specialita regionali') return true;
    const normalizedHeading = normalizeHeading(value);
    return categoryHeadings.has(normalizedHeading) || subcategoryHeadings.has(normalizedHeading);
}

function reflowParagraph(lines) {
    let paragraph = '';

    for (const line of lines) {
        const value = line.trim();
        if (!value) continue;

        if (!paragraph) {
            paragraph = value;
            continue;
        }

        // Il trattino a fine riga è una sillabazione tipografica dell'OCR.
        // Mantieni invece i trattini interni, per esempio in "Emilia-Romagna".
        if (/-$/.test(paragraph) && /^\p{Ll}/u.test(value)) {
            paragraph = `${paragraph.slice(0, -1)}${value}`;
        } else if (/^[,.;:!?%)\]}]/u.test(value)) {
            paragraph += value;
        } else {
            paragraph += ` ${value}`;
        }
    }

    return paragraph.replace(/\s+/g, ' ').trim();
}

function splitParagraphs(lines) {
    const paragraphs = [];
    let current = [];

    function flush() {
        const paragraph = reflowParagraph(current);
        if (paragraph) paragraphs.push(paragraph);
        current = [];
    }

    for (const line of lines) {
        if (line.page >= plateFirstPage && line.page <= plateLastPage) continue;
        const value = line.trimmed;
        if (!value) {
            flush();
            continue;
        }
        if (isStructuralLine(value)) continue;
        current.push(value);
    }
    flush();
    return paragraphs;
}

function makeSections(paragraphs) {
    const ingredientIndex = paragraphs.findIndex((paragraph) =>
        /^ingredienti(?:\s+.*)?\s*:?[ \t]*$/i.test(paragraph.replace(/\n/g, ' ').trim())
    );

    if (ingredientIndex < 0) {
        return {
            notes: [],
            sections: paragraphs.length
                ? [{ title: 'Trascrizione', type: 'text', items: paragraphs, sections: [] }]
                : []
        };
    }

    return {
        notes: paragraphs.slice(0, ingredientIndex),
        sections: [{
            title: 'Ingredienti e procedimento (trascrizione)',
            type: 'text',
            items: paragraphs.slice(ingredientIndex),
            sections: []
        }]
    };
}

function parseRecipes(documentLines) {
    const { titleSet: regionalIndexTitles, regionEntries: regionalIndexEntries } = parseRegionalIndex(documentLines);
    const regionPatterns = buildRegionPatterns();
    const regionTokenPattern = buildRegionTokenPattern();
    const candidates = [];
    let category = '';
    let subcategory = '';
    const bodyEndIndex = documentLines.find((line) => line.page > bodyLastPage)?.index ?? documentLines.length;

    for (const line of documentLines) {
        if (line.page < bodyFirstPage || line.page > bodyLastPage) continue;
        const heading = normalizeHeading(line.trimmed);
        if (categoryHeadings.has(heading)) {
            category = categoryHeadings.get(heading);
            subcategory = '';
        } else if (subcategoryHeadings.has(heading)) {
            subcategory = subcategoryHeadings.get(heading);
        }

        const candidate = findContextualCandidate(documentLines, line.index, regionalIndexTitles, regionPatterns);
        if (candidate) candidates.push({ ...line, ...candidate, category, subcategory });
    }

    const recipes = [];
    const seenIds = new Map();
    const bodyBeforeHeadingByCandidate = new Map();
    const adjustedEndByCandidate = new Map();
    for (let candidateIndex = 1; candidateIndex < candidates.length; candidateIndex += 1) {
        const candidate = candidates[candidateIndex];
        if (candidate.region) continue;
        const previous = candidates[candidateIndex - 1];
        const bodyBeforeHeading = findBodyBeforeHeading(documentLines, previous, candidate);
        if (!bodyBeforeHeading) continue;
        bodyBeforeHeadingByCandidate.set(candidateIndex, bodyBeforeHeading);
        adjustedEndByCandidate.set(candidateIndex - 1, bodyBeforeHeading.regionIndex);
    }
    for (const [candidateIndex, candidate] of candidates.entries()) {
        const next = candidates[candidateIndex + 1];
        const endIndex = adjustedEndByCandidate.get(candidateIndex) ?? (next ? next.index : bodyEndIndex);
        const bodyBeforeHeading = bodyBeforeHeadingByCandidate.get(candidateIndex);
        let contentStartIndex = bodyBeforeHeading
            ? bodyBeforeHeading.regionIndex + 1
            : Number.isInteger(candidate.regionLineIndex)
                ? candidate.regionLineIndex + 1
                : candidate.index + 1;
        let sourceRegion = bodyBeforeHeading?.region || candidate.region;
        let sourceLayout = bodyBeforeHeading ? 'body-before-heading' : 'heading-before-body';
        let paragraphs = bodyBeforeHeading
            ? [
                ...bodyBeforeHeading.paragraphs,
                ...splitParagraphs(documentLines.slice(candidate.index + 1, endIndex))
            ]
            : splitParagraphs(documentLines.slice(contentStartIndex, endIndex));

        if (!paragraphs.length && !(candidate.page >= plateFirstPage && candidate.page <= plateLastPage)) {
            const previous = candidates[candidateIndex - 1];
            const previousIndex = previous ? previous.index + 1 : 0;
            for (let index = candidate.index - 1; index >= previousIndex; index -= 1) {
                const line = documentLines[index];
                if (line.page >= plateFirstPage && line.page <= plateLastPage) continue;
                if (!isStandaloneRegion(line.trimmed)) continue;
                contentStartIndex = index + 1;
                sourceRegion = line.trimmed;
                sourceLayout = 'body-before-heading';
                paragraphs = splitParagraphs(documentLines.slice(contentStartIndex, candidate.index));
                break;
            }
        }

        if (!paragraphs.length) continue;
        const content = makeSections(paragraphs);
        const explicitHeadingRegion = candidate.region ? canonicalizeRegion(candidate.region) : '';
        const contentTexts = [
            ...content.notes,
            ...content.sections.flatMap((section) => section.items || [])
        ];
        const explicitContentRegions = extractExplicitRegions(contentTexts, regionTokenPattern);
        const fallbackRegion = sourceRegion ? canonicalizeRegion(sourceRegion) : '';
        const region = explicitHeadingRegion || explicitContentRegions[0] || fallbackRegion || null;
        const regionSource = explicitHeadingRegion
            ? 'recipe-heading'
                : explicitContentRegions.length
                    ? 'recipe-text'
                    : fallbackRegion
                        ? 'recipe-text'
                        : null;
        const baseId = slugify([candidate.category, candidate.subcategory, candidate.title].filter(Boolean).join('-'))
            || `ricetta-${candidateIndex + 1}`;
        const occurrence = (seenIds.get(baseId) || 0) + 1;
        seenIds.set(baseId, occurrence);
        const localId = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;

        recipes.push({
            id: `${sourceId}--${localId}`,
            title: candidate.title,
            category: candidate.category,
            subcategory: candidate.subcategory,
            sections: content.sections,
            notes: content.notes,
            sourceId,
            sourcePage: candidate.page,
            sourcePageEnd: next ? next.page : bodyLastPage,
            sourceMarkdownLine: candidate.index + 1,
            sourceMarkdownLineEnd: endIndex,
            sourceMarkdownContentLine: contentStartIndex + 1,
            sourceMarkdownContentLineEnd: endIndex,
            sourceHeading: candidate.headingText || candidate.trimmed,
            sourceRegion: region,
            region,
            regionSource,
            geographicReferences: extractGeographicReferences(content.notes, content.sections),
            detection: candidate.detection,
            sourceLayout
        });
    }

    // Quando lo stesso titolo compare più volte, l’indice finale può essere
    // l’unica fonte non ambigua per distinguere le regioni. Prima conserviamo
    // tutte le regioni già dichiarate nelle ricette, poi assegniamo a ciascuna
    // ricetta senza regione una voce ancora non usata dello stesso titolo.
    const usedRegionsByTitle = new Map();
    for (const recipe of recipes) {
        if (!recipe.region || recipe.regionSource === 'alphabetical-index') continue;
        const key = normalizeForMatch(recipe.title);
        if (!usedRegionsByTitle.has(key)) usedRegionsByTitle.set(key, new Set());
        usedRegionsByTitle.get(key).add(recipe.region);
    }
    for (const recipe of recipes) {
        if (recipe.region) continue;
        const entries = regionalIndexEntries.get(normalizeForMatch(recipe.title)) || [];
        const used = usedRegionsByTitle.get(normalizeForMatch(recipe.title)) || new Set();
        const entry = entries.find((candidate) => !used.has(candidate.region)) || entries[0];
        if (!entry) continue;
        recipe.region = entry.region;
        recipe.sourceRegion = entry.region;
        recipe.regionSource = 'alphabetical-index';
        used.add(entry.region);
        usedRegionsByTitle.set(normalizeForMatch(recipe.title), used);
    }

    return { recipes, regionalIndexTitles, regionalIndexEntries };
}

if (!fs.existsSync(sourcePath)) {
    throw new Error(`Trascrizione sorgente non trovata: ${path.relative(repositoryRoot, sourcePath)}`);
}

const markdown = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const documentLines = parseDocument(markdown.split('\n'));
const { recipes, regionalIndexTitles, regionalIndexEntries } = parseRecipes(documentLines);
if (!recipes.length) throw new Error('Nessuna ricetta estratta.');

const output = {
    version: 1,
    sourceId,
    sourceName,
    sourceDocument: path.relative(repositoryRoot, sourcePath),
    extraction: {
        method: 'OCR locale della trascrizione Markdown pagina per pagina',
        bodyPdfPages: [bodyFirstPage, bodyLastPage],
        alphabeticalIndexPdfPages: [alphabeticalRegionIndexFirstPage, alphabeticalRegionIndexLastPage],
        regionalIndexPdfPages: [indexFirstPage, indexLastPage],
        indexedUniqueTitles: regionalIndexTitles.size,
        indexedRecipeRegionEntries: [...regionalIndexEntries.values()].reduce((total, entries) => total + entries.length, 0),
        recipesWithRegion: recipes.filter((recipe) => recipe.region).length,
        recipesWithoutRegion: recipes.filter((recipe) => !recipe.region).length,
        correctionsApplied: true,
        correctionScript: 'tools/correct-regional-transcription.js',
        correctionPolicy: 'Solo correzioni OCR univoche; i casi ambigui restano invariati.',
        jsonTextNormalization: 'Paragrafi ricomposti; sillabazioni a fine riga rimosse quando seguite da una minuscola.'
    },
    recipes
};

fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.writeFileSync(destinationPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Imported ${recipes.length} recipes to ${path.relative(repositoryRoot, destinationPath)}.`);
console.log(`Regional index unique titles: ${regionalIndexTitles.size}.`);
