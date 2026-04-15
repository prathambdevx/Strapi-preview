#!/usr/bin/env node
/**
 * extract-uids.js
 * Finds all ComponentMap typed objects in the website repo and extracts
 * every typename key, converting each to a Strapi component UID.
 *
 * Usage: node extract-uids.js --repo /path/to/website-repo
 * Output: JSON array to stdout
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const repoIndex = args.indexOf('--repo');
if (repoIndex === -1 || !args[repoIndex + 1]) {
  console.error('Usage: node extract-uids.js --repo /path/to/repo');
  process.exit(1);
}
const REPO = args[repoIndex + 1];

// ── UID conversion ────────────────────────────────────────────────────────────

function typenameToUid(typename) {
  // Strip "Component" prefix
  const withoutPrefix = typename.replace(/^Component/, '');
  // Split first PascalCase word as the category
  const match = withoutPrefix.match(/^([A-Z][a-z0-9]*)(.+)$/);
  if (!match) return withoutPrefix.toLowerCase();
  const category = match[1].toLowerCase();
  // Convert the rest from PascalCase to kebab-case
  const rest = match[2]
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
  return `${category}.${rest}`;
}

// ── Find files containing ComponentMap ───────────────────────────────────────

let files = [];
try {
  const result = execSync(
    `grep -rl "ComponentMap" "${REPO}/src" --include="*.tsx" --include="*.ts" 2>/dev/null`,
    { encoding: 'utf8' }
  );
  files = result.trim().split('\n').filter(Boolean);
} catch {
  // grep exits non-zero when no matches found
  files = [];
}

if (files.length === 0) {
  console.error('No ComponentMap files found in', REPO + '/src');
  process.exit(1);
}

// ── Extract typename keys from each file ─────────────────────────────────────

const TYPENAME_RE = /\b(Component[A-Z][A-Za-z0-9]+)\s*:/g;
const seen = new Set();
const results = [];

for (const file of files) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  let match;
  while ((match = TYPENAME_RE.exec(content)) !== null) {
    const typename = match[1];
    if (seen.has(typename)) continue;
    seen.add(typename);
    results.push({
      typename,
      uid: typenameToUid(typename),
      sourceFile: path.relative(REPO, file),
    });
  }
}

if (results.length === 0) {
  console.error('No Component* typename keys found in ComponentMap files');
  process.exit(1);
}

console.log(JSON.stringify(results, null, 2));
