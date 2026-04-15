#!/usr/bin/env node
/**
 * patch-admin-app.js
 * Patches an existing src/admin/app.tsx to register ComponentPreviewPanel.
 * Detects Strapi version and uses the correct API:
 *   - v5: addEditViewSidePanel (component returns {title, content})
 *   - v4: injectContentManagerComponent (component returns JSX directly)
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   node patch-admin-app.js --file /path/to/app.tsx --strapi-version 5
 */

const fs = require('fs');

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const FILE = get('--file');
const STRAPI_VERSION = parseInt(get('--strapi-version') || '5', 10);

if (!FILE) {
  console.error('Usage: node patch-admin-app.js --file /path/to/app.tsx [--strapi-version 4|5]');
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  console.error('File not found:', FILE);
  process.exit(1);
}

let content = fs.readFileSync(FILE, 'utf8');

// Already registered — nothing to do
if (content.includes('ComponentPreviewPanel')) {
  console.log('ComponentPreviewPanel already registered in', FILE);
  process.exit(0);
}

// ── Add the import ────────────────────────────────────────────────────────────

const IMPORT_LINE = `import { ComponentPreviewPanel } from './components/ComponentPreviewPanel';`;

const lastImportMatch = [...content.matchAll(/^import .+;$/gm)].pop();
if (lastImportMatch) {
  const insertAt = lastImportMatch.index + lastImportMatch[0].length;
  content = content.slice(0, insertAt) + '\n' + IMPORT_LINE + content.slice(insertAt);
} else {
  content = IMPORT_LINE + '\n\n' + content;
}

// ── Add the panel registration (version-aware) ───────────────────────────────

const PANEL_REGISTRATION = STRAPI_VERSION >= 5
  ? `
    const contentManagerApis = app.getPlugin('content-manager').apis;
    contentManagerApis.addEditViewSidePanel([ComponentPreviewPanel]);`
  : `
    app.injectContentManagerComponent('editView', 'right-links', {
      name: 'component-preview-panel',
      Component: ComponentPreviewPanel,
    });`;

// Look for a bootstrap(app) function body and inject inside it
const bootstrapMatch = content.match(
  /(bootstrap\s*\(\s*\{?\s*app\s*\}?\s*\)\s*\{)([\s\S]*?)(\n\s*\})/
);

if (bootstrapMatch) {
  const fullMatch = bootstrapMatch[0];
  const openBrace = bootstrapMatch[1];
  const body = bootstrapMatch[2];
  const closeBrace = bootstrapMatch[3];

  const patched = openBrace + body + PANEL_REGISTRATION + closeBrace;
  content = content.replace(fullMatch, patched);
  console.log(`Injected panel registration (Strapi v${STRAPI_VERSION}) into existing bootstrap function`);
} else {
  content =
    content.trimEnd() +
    `

export default {
  bootstrap(app: any) {${PANEL_REGISTRATION}
  },
};
`;
  console.log(`No bootstrap function found — appended export default with bootstrap (Strapi v${STRAPI_VERSION})`);
}

fs.writeFileSync(FILE, content);
console.log('Patched:', FILE);
