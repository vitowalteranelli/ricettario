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
    'Venero',
    'Vereto',
    'Busilicata',
    'Zoscana'
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

function parseRegionalIndex(documentLines) {
    const titleSet = new Set();
    for (const line of documentLines) {
        if (line.page < indexFirstPage || line.page > indexLastPage) continue;
        const match = line.trimmed.match(/^(.+),\s*(\d{1,4})$/);
        if (!match) continue;
        const title = match[1].trim();
        if (title.length <= 2 || !isTitleCaseLine(title) || /[.,:;]$/.test(title)) continue;
        titleSet.add(normalizeForMatch(title));
    }
    return titleSet;
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

function findCandidate(line, regionalIndexTitles, regionPatterns) {
    const value = line.trimmed;
    if (!value || value.length <= 2 || isExcludedHeading(value)) return null;

    for (const regionPattern of regionPatterns) {
        const inlineMatch = value.match(regionPattern);
        if (inlineMatch) {
            const title = inlineMatch[1].trim().replace(/[—–-]\s*$/, '').trim();
            if (title && isTitleCaseLine(title)) {
                const normalizedTitle = normalizeForMatch(title);
                if (normalizedTitle.startsWith('ricetta del ') || normalizedTitle.startsWith('ricetta della ')) return null;
                return { title, region: inlineMatch[2], detection: 'inline-region' };
            }
        }
    }

    if (!isTitleCaseLine(value) || /[.,:;]$/.test(value)) return null;
    if (!regionalIndexTitles.has(normalizeForMatch(value))) return null;
    return { title: value, region: '', detection: 'regional-index-title' };
}

function findContextualCandidate(documentLines, lineIndex, regionalIndexTitles, regionPatterns) {
    const line = documentLines[lineIndex];
    const candidate = findCandidate(line, regionalIndexTitles, regionPatterns);

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
    const regionalIndexTitles = parseRegionalIndex(documentLines);
    const regionPatterns = buildRegionPatterns();
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
    for (const [candidateIndex, candidate] of candidates.entries()) {
        const next = candidates[candidateIndex + 1];
        const endIndex = next ? next.index : bodyEndIndex;
        let contentStartIndex = Number.isInteger(candidate.regionLineIndex)
            ? candidate.regionLineIndex + 1
            : candidate.index + 1;
        let sourceRegion = candidate.region;
        let sourceLayout = 'heading-before-body';
        let paragraphs = splitParagraphs(documentLines.slice(contentStartIndex, endIndex));

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
            sourceHeading: candidate.trimmed,
            sourceRegion,
            detection: candidate.detection,
            sourceLayout
        });
    }

    return { recipes, regionalIndexTitles };
}

if (!fs.existsSync(sourcePath)) {
    throw new Error(`Trascrizione sorgente non trovata: ${path.relative(repositoryRoot, sourcePath)}`);
}

const markdown = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const documentLines = parseDocument(markdown.split('\n'));
const { recipes, regionalIndexTitles } = parseRecipes(documentLines);
if (!recipes.length) throw new Error('Nessuna ricetta estratta.');

const output = {
    version: 1,
    sourceId,
    sourceName,
    sourceDocument: path.relative(repositoryRoot, sourcePath),
    extraction: {
        method: 'OCR locale della trascrizione Markdown pagina per pagina',
        bodyPdfPages: [bodyFirstPage, bodyLastPage],
        regionalIndexPdfPages: [indexFirstPage, indexLastPage],
        indexedUniqueTitles: regionalIndexTitles.size,
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
