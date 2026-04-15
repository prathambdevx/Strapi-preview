#!/usr/bin/env node
/**
 * update-schemas.js
 * Reads capture-result.json and updates each captured component's
 * schema JSON in the Strapi repo to include info.preview.
 *
 * Usage:
 *   node update-schemas.js \
 *     --strapi-repo /path/to/strapi \
 *     --capture-result /path/to/capture-result.json
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const STRAPI_REPO = get('--strapi-repo');
const CAPTURE_RESULT = get('--capture-result');

if (!STRAPI_REPO || !CAPTURE_RESULT) {
  console.error('--strapi-repo and --capture-result are required');
  process.exit(1);
}

const result = JSON.parse(fs.readFileSync(CAPTURE_RESULT, 'utf8'));
const capturedUids = result.captured || [];

let updated = 0;
let notFound = 0;

for (const uid of capturedUids) {
  // uid format: "common.hero-banner"
  const parts = uid.split('.');
  if (parts.length !== 2) {
    console.log(`  Skipping malformed UID: ${uid}`);
    continue;
  }

  const [category, name] = parts;
  const schemaPath = path.join(
    STRAPI_REPO,
    'src',
    'components',
    category,
    `${name}.json`
  );

  if (!fs.existsSync(schemaPath)) {
    console.log(`  ✗ Schema not found: ${schemaPath}`);
    notFound++;
    continue;
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    console.log(`  ✗ Could not parse ${schemaPath}: ${err.message}`);
    continue;
  }

  if (!schema.info) schema.info = {};
  schema.info.preview = `uploads/component-previews/${uid}.png`;

  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n');
  console.log(`  ✓ Updated: ${schemaPath}`);
  updated++;
}

console.log(`\nSchemas updated: ${updated}`);
if (notFound > 0) {
  console.log(`Schema files not found: ${notFound} (UIDs may not have schema files yet)`);
}
