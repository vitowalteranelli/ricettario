#!/usr/bin/env node

/*
 * Estrae la fonte “1080 recetas de cocina” direttamente dal PDF.
 *
 * Questa prima fase è volutamente conservativa:
 * - il testo spagnolo estratto dal PDF viene conservato nel Markdown;
 * - ogni ricetta conserva anche il proprio testo originale nel JSON;
 * - non viene eseguita alcuna traduzione automatica;
 * - i pochi numeri mancanti o evidentemente corrotti sono riallineati alla
 *   sequenza stampata nel libro e registrati in warnings.
 *
 * Uso:
 *   node tools/import-spanish-recipes.js \
 *     "/percorso/1080_recetas_cocina.pdf" \
 *     "/percorso/1080-recetas-edizione-di-riferimento.pdf"
 *
 * Il secondo PDF è facoltativo e viene usato solo per verificare titoli,
 * numerazione e indice. Il testo principale resta quello del primo PDF:
 * alcune edizioni EPUB convertite in PDF duplicano materialmente le colonne
 * delle quantità e non sono quindi una fonte sicura per il corpo delle ricette.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const sourceId = '1080-recetas-cocina';
const sourceLabel = '1080 recetas de cocina';
const defaultOutputMarkdown = path.join(repositoryRoot, 'output', `${sourceId}.md`);
const defaultOutputDataset = path.join(repositoryRoot, 'datasets', `${sourceId}-es.json`);

const pdfPath = process.argv[2];
const referencePdfPath = process.argv[3] || null;
if (!pdfPath) {
    console.error('Uso: node tools/import-spanish-recipes.js "PDF principale" ["PDF di riferimento"]');
    process.exit(1);
}
if (!fs.existsSync(pdfPath)) {
    console.error(`PDF non trovato: ${pdfPath}`);
    process.exit(1);
}
if (referencePdfPath && !fs.existsSync(referencePdfPath)) {
    console.error(`PDF di riferimento non trovato: ${referencePdfPath}`);
    process.exit(1);
}

function extractPdfText(filePath) {
    return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });
}

const rawPdfText = extractPdfText(pdfPath);
const referencePdfText = referencePdfPath ? extractPdfText(referencePdfPath) : '';

const lines = rawPdfText.replace(/\r/g, '').split('\n');

function normalizeNumber(value) {
    return Number(String(value).replace('.', ''));
}

function sourceNumberText(value) {
    return String(value).length > 3
        ? `${String(value).slice(0, -3)}.${String(value).slice(-3)}`
        : String(value);
}

function pageNumbersForLines(startIndex, endIndex) {
    let page = 1;
    const pages = new Set();
    for (let index = 0; index < lines.length; index += 1) {
        if (index >= startIndex && index < endIndex) pages.add(page);
        page += (lines[index].match(/\f/g) || []).length;
        if (index >= endIndex && pages.size) break;
    }
    return [...pages];
}

function linePage(index) {
    let page = 1;
    for (let cursor = 0; cursor < index; cursor += 1) {
        page += (lines[cursor].match(/\f/g) || []).length;
    }
    return page;
}

function cleanExtractedText(value) {
    return String(value || '')
        .replace(/\f/g, '\n')
        .replace(/\u0000/g, '')
        .trim();
}

function paragraphsFromText(value) {
    return cleanExtractedText(value)
        .split(/\n\s*\n/u)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

function fullTitleFromHeading(index, firstTitle) {
    const parts = [firstTitle.trim()];
    let lineCount = 1;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 4); cursor += 1) {
        const candidate = lines[cursor].trim();
        if (!candidate) break;
        if (isRecipeHeading(lines[cursor])) break;
        const uppercaseContinuation = /^[A-ZÁÉÍÓÚÜÑ0-9 ,.'’()¡!¿?/:;—–-]+$/u.test(candidate);
        const servingContinuation = /\bpersonas?\b/iu.test(candidate) && candidate.length <= 100;
        if (!uppercaseContinuation && !servingContinuation) break;
        const currentTitle = parts.join(' ');
        const incompleteTitle = /\b(?:Y|E|O|DE|DEL|DE LA|DE LOS|DE LAS|CON|PARA|A|AL|EN|SIN)\s*$/iu.test(currentTitle);
        const referenceContinuation = /^\d+\)$/u.test(candidate) && /\breceta$/iu.test(currentTitle);
        if (uppercaseContinuation && !servingContinuation && !incompleteTitle && !referenceContinuation) break;
        parts.push(candidate);
        lineCount += 1;
        if (/personas?\)?$/iu.test(candidate)) break;
    }
    return {
        title: parts.join(' ').replace(/\s+/g, ' ').trim(),
        lineCount
    };
}

function splitTitleAndServing(fullTitle) {
    const title = fullTitle
        .replace(/\s*\(\s*\d+(?:\s*[aá]\s*\d+)?\s*[—–-]?\s*personas?[^)]*\)\s*/iu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return {
        title,
        fullTitle
    };
}

function isRecipeHeading(line) {
    return /^\s*((?:\d{1,3}\.\d{3}|\d{1,4}))\s*\.?\s*[—–-]\s*(.*)$/u.test(line);
}

function parseRecipeHeading(line, index) {
    const match = line.match(/^\s*((?:\d{1,3}\.\d{3}|\d{1,4}))\s*\.?\s*[—–-]\s*(.*)$/u);
    if (!match) return null;
    const printedNumber = normalizeNumber(match[1]);
    if (printedNumber < 1 || printedNumber > 1080) return null;
    const titleData = fullTitleFromHeading(index, match[2]);
    return {
        index,
        line: index + 1,
        printedNumber,
        printedNumberText: match[1],
        title: titleData.title,
        lineCount: titleData.lineCount,
        page: linePage(index)
    };
}

function parseNumberless801(line, index) {
    const match = line.match(/^\s*801\s+([A-ZÁÉÍÓÚÜÑ].*)$/u);
    if (!match) return null;
    const titleData = fullTitleFromHeading(index, match[1]);
    return {
        index,
        line: index + 1,
        printedNumber: 801,
        printedNumberText: '801',
        title: titleData.title,
        lineCount: titleData.lineCount,
        page: linePage(index),
        warning: 'Nel PDF il numero 801 è stampato senza il separatore tipografico.'
    };
}

const firstRecipeIndex = lines.findIndex((line, index) => index > 1000 && /^\s*1\.—/u.test(line));
const lastRecipeEndIndex = lines.findIndex((line, index) => index > firstRecipeIndex && /^\s*Ep[ií]logo\s*$/u.test(line.trim()));
if (firstRecipeIndex < 0 || lastRecipeEndIndex < 0) {
    throw new Error('Impossibile delimitare il blocco principale delle ricette nel PDF.');
}

const headings = [];
for (let index = firstRecipeIndex; index < lastRecipeEndIndex; index += 1) {
    const heading = parseRecipeHeading(lines[index], index) || parseNumberless801(lines[index], index);
    if (heading) headings.push(heading);
}

const corrections = new Map([
    [6120, { number: 216, reason: 'Il PDF stampa “16”; la posizione nella sequenza 215–217 rende univoco il numero 216.' }],
    [12615, { number: 545, reason: 'Il PDF ristampa “544”; la ricetta è la seconda delle due ricette consecutive sui calamari.' }],
    [14255, { number: 619, reason: 'Il PDF stampa “819”; la posizione tra 618 e 620 rende univoco il numero 619.' }],
    [17251, { number: 759, reason: 'Il PDF stampa “751”; la posizione tra 758 e 760 rende univoco il numero 759.' }],
    [17866, { number: 783, reason: 'Il PDF stampa “781”; la posizione tra 782 e 784 rende univoco il numero 783.' }],
    [18461, { number: 810, reason: 'Il PDF stampa “81”; la posizione tra 809 e 811 rende univoco il numero 810.' }]
]);

const specialEntries = [
    {
        number: 195,
        index: 5642,
        title: 'JUDÍAS BLANCAS EN ENSALADA',
        titleVerified: true,
        warning: 'L’intestazione numerata non è presente nel PDF; il titolo è confermato dal calendario/menu della fonte.'
    },
    {
        number: 703,
        index: 15935,
        title: 'BOUILLABAISSE',
        titleVerified: true,
        warning: 'L’intestazione numerata e il corpo non sono presenti nel PDF principale; il titolo BOUILLABAISSE è confermato dall’indice alfabetico della nuova edizione di riferimento. Nessun testo è stato inventato.'
    },
    {
        number: 736,
        index: 16700,
        title: 'REDONDO GUISADO',
        titleVerified: true,
        warning: 'L’intestazione numerata non è presente nel PDF principale; il titolo REDONDO GUISADO è confermato dall’indice alfabetico della nuova edizione di riferimento.'
    },
    {
        number: 812,
        index: 18517,
        title: 'CARNE DE CORDERO ESTOFADA',
        titleVerified: true,
        warning: 'L’intestazione numerata non è presente nel PDF principale; il titolo è confermato dall’indice alfabetico della nuova edizione di riferimento, alla voce “cordero — estofado, 812”.'
    }
];

if (referencePdfPath) {
    const referenceChecks = [
        { number: 703, pattern: /Bouillabaisse\s*,\s*703/iu },
        { number: 736, pattern: /redondo\s+guisado\s*,\s*736/iu },
        { number: 812, pattern: /estofado\s*,\s*812/iu }
    ];
    for (const check of referenceChecks) {
        if (!check.pattern.test(referencePdfText)) {
            throw new Error(`Il PDF di riferimento non conferma il titolo della ricetta ${check.number}.`);
        }
    }
}

const starts = headings.map((heading) => {
    const correction = corrections.get(heading.line);
    return {
        ...heading,
        number: correction ? correction.number : heading.printedNumber,
        warnings: [
            ...(heading.warning ? [heading.warning] : []),
            ...(correction ? [correction.reason] : [])
        ]
    };
});

for (const entry of specialEntries) {
    starts.push({
        index: entry.index,
        line: entry.index + 1,
        page: linePage(entry.index),
        printedNumber: null,
        printedNumberText: null,
        title: entry.title,
        titleVerified: entry.titleVerified === true,
        lineCount: 0,
        number: entry.number,
        warnings: [entry.warning]
    });
}

starts.sort((left, right) => left.index - right.index);

const numbers = starts.map((entry) => entry.number);
const expectedNumbers = Array.from({ length: 1080 }, (_, index) => index + 1);
if (starts.length !== 1080 || numbers.some((number, index) => number !== expectedNumbers[index])) {
    throw new Error(`Allineamento fallito: trovate ${starts.length} intestazioni, attesa sequenza 1–1080.`);
}

function buildRecipe(entry, nextEntry) {
    const isMissingPlaceholder = entry.number === 703;
    const contentStart = entry.index + entry.lineCount;
    const contentEnd = isMissingPlaceholder ? contentStart : (nextEntry ? nextEntry.index : lastRecipeEndIndex);
    let originalText = isMissingPlaceholder ? '' : cleanExtractedText(lines.slice(contentStart, contentEnd).join('\n'));
    if ([18, 19, 187, 674, 958, 959].includes(entry.number)) originalText = '';
    const titleData = splitTitleAndServing(entry.title);
    const warnings = [...entry.warnings];
    if (isMissingPlaceholder) warnings.push('Voce segnaposto: da non usare come ricetta finché non viene trovata un’edizione completa del PDF.');
    const uncertainFields = ['translation'];
    if (entry.printedNumber !== null && entry.printedNumber !== entry.number) uncertainFields.push('sourceNumber');
    if (entry.printedNumber === null && !entry.titleVerified) uncertainFields.push('title');
    if (isMissingPlaceholder) uncertainFields.push('text');

    return {
        id: `${sourceId}--${String(entry.number).padStart(4, '0')}`,
        sourceId,
        sourceNumber: entry.number,
        sourcePrintedNumber: entry.printedNumber,
        sourcePages: isMissingPlaceholder ? [] : pageNumbersForLines(entry.index, contentEnd),
        language: 'es',
        translationStatus: 'pending',
        title: titleData.title,
        originalTitle: titleData.fullTitle,
        category: 'Cucina spagnola',
        subcategory: '',
        tags: ['spagnola', 'testo originale'],
        notes: ['Testo originale spagnolo estratto dal PDF. Traduzione italiana non ancora applicata.'],
        region: null,
        geographicReferences: [],
        sections: originalText
            ? [{ title: 'Testo originale (spagnolo)', type: 'text', items: paragraphsFromText(originalText), sections: [] }]
            : [],
        originalText,
        warnings,
        uncertainFields: [...new Set(uncertainFields)]
    };
}

const recipes = starts.map((entry, index) => buildRecipe(entry, starts[index + 1]));

const sourcePages = rawPdfText
    .replace(/\r/g, '')
    .split('\f');
if (sourcePages.length > 1 && !sourcePages.at(-1).trim()) sourcePages.pop();

const markdownPages = sourcePages
    .map((pageText, index) => {
        const pageNumber = String(index + 1).padStart(4, '0');
        return `<!-- PDF page ${pageNumber} | ${sourceLabel} -->\n\n${pageText.replace(/\n+$/u, '')}`;
    })
    .join('\n\n');

const dataset = {
    version: 1,
    sourceId,
    sourceName: sourceLabel,
    language: 'es',
    author: 'Simone Ortega',
    sourceFile: path.basename(pdfPath),
    extraction: {
        tool: 'pdftotext -layout',
        translated: false,
        mainRecipeSlots: 1080,
        extractedRecipeRecords: recipes.length,
        notes: [
            'Il testo originale è conservato in originalText e nel Markdown della fonte.',
            'La traduzione italiana deve essere eseguita in una fase separata e verificabile.',
            'Le correzioni della numerazione sono registrate nelle warnings delle singole ricette.'
        ]
    },
    recipes
};

if (referencePdfPath) {
    dataset.extraction.referenceSourceFile = path.basename(referencePdfPath);
    dataset.extraction.referencePurpose = 'Verifica indipendente di indice, titoli e numerazione; non usato per il corpo delle ricette perché contiene duplicazioni materialmente presenti nelle tabelle.';
}

fs.mkdirSync(path.dirname(defaultOutputMarkdown), { recursive: true });
fs.mkdirSync(path.dirname(defaultOutputDataset), { recursive: true });
fs.writeFileSync(defaultOutputMarkdown, markdownPages.endsWith('\n') ? markdownPages : `${markdownPages}\n`, 'utf8');
fs.writeFileSync(defaultOutputDataset, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

const warningCount = recipes.reduce((total, recipe) => total + recipe.warnings.length, 0);
console.log(`Scritto ${defaultOutputMarkdown}`);
console.log(`Scritto ${defaultOutputDataset}`);
console.log(`Ricette/slot esportati: ${recipes.length}/1080`);
console.log(`Ricette con avvertenze: ${recipes.filter((recipe) => recipe.warnings.length).length}`);
console.log(`Avvertenze totali: ${warningCount}`);
