#!/usr/bin/env node

/*
 * One-time, dependency-free migration from the Markdown-like corpus embedded
 * in Ricettario_CBT.html to the CBT Pirotta source dataset.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repositoryRoot, 'Ricettario_CBT.html');
const sourceId = 'cbt-pirotta';
const sourceName = 'CBT Pirotta';
const destinationPath = path.join(repositoryRoot, 'datasets', `${sourceId}.json`);
const catalogPath = path.join(repositoryRoot, 'datasets', 'catalog.json');

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractMarkdown(html) {
  const match = html.match(/<script\s+type="text\/plain"\s+id="markdown-data">([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Blocco markdown-data non trovato.');
  return match[1].replace(/^\r?\n/, '').replace(/\r\n/g, '\n');
}

function createSection(title) {
  return { title, type: 'group', items: [], sections: [] };
}

function addItem(section, type, text) {
  if (!text) return;
  if (section.type === 'group') section.type = type;
  if (section.type === 'text' && type !== 'text') section.type = type;
  section.items.push(text);
}

function parseRecipes(markdown) {
  const lines = markdown.split('\n');
  const recipes = [];
  const seenIds = new Map();
  let category = '';
  let subcategory = '';
  let current = null;
  let sectionStack = [];

  function isStandaloneRecipeHeading(index) {
    let hasContent = false;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (candidate.startsWith('## ') || candidate.startsWith('### ')) return hasContent;
      if (candidate.startsWith('#### ')) return false;
      if (candidate.trim() && candidate.trim() !== '---') hasContent = true;
    }
    return hasContent;
  }

  function finishRecipe() {
    if (!current) return;
    const baseId = slugify([category, subcategory, current.title].filter(Boolean).join('-')) || `ricetta-${recipes.length + 1}`;
    const occurrence = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, occurrence);
    const localId = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
    current.id = `${sourceId}--${localId}`;
    current.sourceId = sourceId;
    recipes.push(current);
    current = null;
    sectionStack = [];
  }

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (line.startsWith('## ')) {
      finishRecipe();
      category = line.slice(3).trim();
      subcategory = '';
      return;
    }
    if (line.startsWith('### ')) {
      finishRecipe();
      const title = line.slice(4).trim();
      if (isStandaloneRecipeHeading(lineIndex)) {
        current = {
          id: '',
          title,
          category,
          subcategory: '',
          sections: [],
          notes: [],
          legacyMarkdown: ''
        };
        subcategory = '';
      } else {
        subcategory = title;
      }
      return;
    }
    if (line.startsWith('#### ')) {
      finishRecipe();
      current = {
        id: '',
        title: line.slice(5).trim(),
        category,
        subcategory,
        sections: [],
        notes: [],
        legacyMarkdown: ''
      };
      return;
    }
    if (!current) return;

    current.legacyMarkdown += `${rawLine}\n`;
    if (!trimmed) return;
    if (trimmed === '---') return;

    const heading = line.match(/^(\s*)\*\s+\*\*(.+?):\*\*(?:\s*(.*))$/);
    if (heading) {
      const indent = heading[1].length;
      while (sectionStack.length && sectionStack[sectionStack.length - 1].indent >= indent) sectionStack.pop();
      const section = createSection(heading[2].trim());
      const parent = sectionStack[sectionStack.length - 1];
      (parent ? parent.section.sections : current.sections).push(section);
      sectionStack.push({ indent, section });
      addItem(section, 'text', heading[3].trim());
      return;
    }

    const activeSection = sectionStack[sectionStack.length - 1]?.section;
    if (!activeSection) {
      current.notes.push(trimmed);
      return;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      addItem(activeSection, 'ordered', ordered[1].trim());
      return;
    }
    const unordered = line.match(/^\s*\*\s+(.*)$/);
    if (unordered) {
      addItem(activeSection, 'unordered', unordered[1].trim());
      return;
    }
    addItem(activeSection, 'text', trimmed);
  });

  finishRecipe();
  // Il testo originale resta in Ricettario_CBT.html come backup; non lo
  // duplichiamo nel JSON per mantenere il dataset leggero e facilmente
  // aggiornabile tramite GitHub Contents API.
  return recipes.map(({ legacyMarkdown, ...recipe }) => recipe);
}

const markdown = extractMarkdown(fs.readFileSync(sourcePath, 'utf8'));
const recipes = parseRecipes(markdown);
if (recipes.length === 0) throw new Error('Nessuna ricetta estratta.');

const output = {
  version: 1,
  sourceId,
  sourceName,
  recipes
};
fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.writeFileSync(destinationPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const catalog = fs.existsSync(catalogPath)
  ? JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  : { version: 1, sources: [] };
if (!Array.isArray(catalog.sources)) catalog.sources = [];
const sourceEntry = { id: sourceId, label: sourceName, path: `datasets/${sourceId}.json` };
const existingIndex = catalog.sources.findIndex((source) => source.id === sourceId);
if (existingIndex >= 0) catalog.sources[existingIndex] = { ...catalog.sources[existingIndex], ...sourceEntry };
else catalog.sources.push(sourceEntry);
catalog.version = 1;
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

console.log(`Migrated ${recipes.length} recipes to ${path.relative(repositoryRoot, destinationPath)}.`);
