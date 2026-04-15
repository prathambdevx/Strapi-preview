#!/usr/bin/env node
/**
 * write-manifest.js
 * Writes manifest.json to the component-previews output directory.
 *
 * Usage:
 *   node write-manifest.js \
 *     --output-dir /path/to/strapi/public/uploads/component-previews \
 *     --capture-result /path/to/capture-result.json
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const OUTPUT_DIR = get('--output-dir');
const CAPTURE_RESULT = get('--capture-result');

if (!OUTPUT_DIR || !CAPTURE_RESULT) {
  console.error('--output-dir and --capture-result are required');
  process.exit(1);
}

const result = JSON.parse(fs.readFileSync(CAPTURE_RESULT, 'utf8'));
const capturedUids = result.captured || [];

const manifest = {
  generatedAt: new Date().toISOString(),
  items: capturedUids.map((uid) => ({
    uid,
    file: `${uid}.png`,
  })),
};

const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Manifest written: ${manifestPath}`);
console.log(`Total items: ${manifest.items.length}`);
