# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free static web app. `index.html` is the password wall,
reader view, and Admin UI; `setup.html` is a local-only configuration helper;
`config.json` stores the encrypted PAT payload and reader-password hashes;
`datasets/catalog.json` lists the recipe sources; and each JSON in `datasets/`
is the structured recipe dataset rendered by `index.html`;
`prompts/recipe-extraction.md` and `prompts/recipe-schema.json` define the AI
recipe-import contract;
`favicon.svg`, `manifest.webmanifest`, `sw.js`, and `icons/` provide the favicon
and installable web-app shell;
`Ricettario_CBT.html` remains the original migration source/backup.
`tools/migrate-recipes.js` is the
dependency-free one-time importer. `README.md` holds the three-step deployment
guide. There are no separate asset or test directories.

## Build, Test, and Development Commands

No build step or dependency installation is required. Serve the repository
locally so browser behavior matches a real web origin:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html` or `setup.html`. For a quick static
check, open the HTML file directly in a browser, though the local server is
preferred. There is no configured formatter, linter, or test runner.

## Coding Style & Naming Conventions

Keep the existing four-space indentation in HTML, CSS, and JavaScript. Use
semantic, descriptive kebab-case IDs and class names, and camelCase for
JavaScript variables and functions. Preserve UTF-8 Italian recipe text and the
inline, self-contained architecture. Never place a PAT, password, or plaintext
credential in source or Git history.

## Testing Guidelines

Automated tests and coverage requirements are not currently defined. For UI
changes, manually verify the locked initial state, reader login, Admin login,
recipe search/filter, recipe add/edit/duplicate/remove, dataset publishing,
password add/edit/remove, and responsive layout.
Confirm the browser console has no errors and that the PAT is absent from
network logs, browser storage, and committed files. Verify that a reader refresh
restores access until the tab closes; an Admin refresh restores the panel but
requires reactivation before PAT/API-key operations. With AI configured, also
verify that image/PDF import produces a draft, surfaces warnings, and never
publishes without the existing manual save action. Verify source management,
source selection when adding/importing a recipe, and source-specific publishing.
On GitHub Pages, verify that the favicon and PWA manifest load and that the
catalog and source datasets are fetched from the network after a refresh rather
than served from the service-worker cache.

## Commit & Pull Request Guidelines

History currently contains only `Initial commit`, so no established convention
can be inferred. Use short, imperative subjects such as `Fix recipe search`
or `Add dessert recipe`. Keep commits focused. Pull requests should explain
the user-visible change, identify manual checks performed, and include a
screenshot or short recording for visual/UI changes; mention any recipe text
or formatting assumptions that reviewers should verify.

## Content and Safety Notes

Recipe data in `Ricettario_CBT.html` is rendered by its embedded parser. Keep
recipe content in its expected Markdown-like format and avoid introducing
unescaped markup or scripts into data lines. The password wall is client-side
only; do not use GitHub Pages for confidential content.
