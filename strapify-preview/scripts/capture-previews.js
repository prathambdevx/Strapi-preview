#!/usr/bin/env node
/**
 * capture-previews.js
 *
 * Crawls the live website, finds [data-strapi-uid] elements,
 * and saves a cropped screenshot for each unique UID.
 *
 * Features:
 *   - Incremental runs: skips already-captured UIDs (use --force to override)
 *   - Hydration-aware: waits for [data-strapi-uid] to appear after JS hydration
 *   - Configurable wait timeout via --wait-timeout
 *   - Fast-fail validation on the homepage before crawling all pages
 *   - Detects Server Component / Suspense issues and warns clearly
 *   - Falls back to a /strapify-preview-page route if normal capture fails
 *
 * Usage:
 *   node capture-previews.js \
 *     --website-url http://localhost:3000 \
 *     --output-dir /path/to/strapi/public/uploads/component-previews \
 *     --playwright-dir /tmp/skill-playwright-12345 \
 *     [--force] \
 *     [--wait-timeout 20000] \
 *     [--preview-page]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const WEBSITE_URL  = get('--website-url') || 'http://localhost:3000';
const OUTPUT_DIR   = get('--output-dir');
const PLAYWRIGHT_DIR = get('--playwright-dir');
const FORCE        = args.includes('--force');
const WAIT_TIMEOUT = parseInt(get('--wait-timeout') || '15000', 10);
const USE_PREVIEW_PAGE = args.includes('--preview-page');

if (!OUTPUT_DIR) { console.error('--output-dir is required'); process.exit(1); }

// ── Load already-captured UIDs ────────────────────────────────────────────────

function loadAlreadyCaptured() {
  if (FORCE) { console.log('--force: recapturing all UIDs'); return new Set(); }
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return new Set();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const items = Array.isArray(manifest.items) ? manifest.items : [];
    const uids = new Set(
      items.map((i) => i.uid).filter((uid) => fs.existsSync(path.join(OUTPUT_DIR, `${uid}.png`)))
    );
    if (uids.size > 0) console.log(`↩  Skipping ${uids.size} already-captured UID(s) — use --force to recapture all`);
    return uids;
  } catch { return new Set(); }
}

// ── Resolve Playwright ────────────────────────────────────────────────────────

const playwrightPath = PLAYWRIGHT_DIR
  ? path.join(PLAYWRIGHT_DIR, 'node_modules', 'playwright')
  : 'playwright';

let playwright;
try { playwright = require(playwrightPath); }
catch { console.error('Playwright not found at', playwrightPath); process.exit(1); }

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Sitemap fetcher ───────────────────────────────────────────────────────────

async function fetchSitemapUrls(browser, baseUrl) {
  const page = await browser.newPage();
  let urls = [];
  try {
    const res = await page.goto(`${baseUrl}/sitemap.xml`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (res && res.ok()) {
      const content = await page.content();
      const matches = [...content.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)];
      urls = matches.map((m) => m[1].trim()).filter((u) => {
        try { return new URL(u).hostname === new URL(baseUrl).hostname; } catch { return false; }
      });
    }
  } catch { }
  await page.close();
  if (urls.length === 0) {
    console.log('No sitemap found — crawling homepage only');
    return [baseUrl + '/'];
  }
  console.log(`Found ${urls.length} URL(s) in sitemap`);
  return urls;
}

// ── Wait for [data-strapi-uid] elements with hydration awareness ──────────────

async function waitForStrapiElements(page) {
  // Strategy 1: wait for selector to appear (handles Suspense/hydration)
  try {
    await page.waitForSelector('[data-strapi-uid]', { timeout: WAIT_TIMEOUT });
    return true;
  } catch {
    // Selector never appeared within timeout
  }

  // Strategy 2: check if there are any SSR-rendered elements in raw HTML
  // (catches cases where attributes exist but aren't being found by Playwright)
  const rawHtml = await page.content();
  if (rawHtml.includes('data-strapi-uid')) {
    // Attributes exist in HTML but Playwright locator missed them — try evaluate
    const count = await page.evaluate(() =>
      document.querySelectorAll('[data-strapi-uid]').length
    );
    if (count > 0) return true;
  }

  return false;
}

// ── Detect if this looks like a Server Component / Suspense architecture ──────

async function detectServerComponentIssue(page, url) {
  // Check if the page source contains our attribute in raw HTML
  const rawHtml = await page.content();
  const hasInHtml = rawHtml.includes('data-strapi-uid');

  // Check if JS has hydrated yet by looking for React root markers
  const hasReactRoot = await page.evaluate(() =>
    !!document.querySelector('[data-reactroot], #__NEXT_DATA__, [data-next-router-state-tree]')
  );

  const hasHydratedElements = await page.evaluate(() =>
    document.querySelectorAll('[data-strapi-uid]').length > 0
  );

  if (!hasInHtml && hasReactRoot && !hasHydratedElements) {
    return {
      detected: true,
      reason: 'Next.js detected but [data-strapi-uid] never appeared — likely Server Components or Suspense boundaries preventing client-side hydration of wrapped elements',
    };
  }

  if (!hasInHtml && !hasHydratedElements) {
    return {
      detected: true,
      reason: `No [data-strapi-uid] attributes found in page source or DOM after ${WAIT_TIMEOUT}ms — the renderer patch may not have been applied, or components are not rendering on this page`,
    };
  }

  return { detected: false };
}

// ── Capture elements from a single page ──────────────────────────────────────

async function capturePage(page, url, alreadyCaptured, newlyCaptured, missed, allSeen, skipped) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const found = await waitForStrapiElements(page);

    if (!found) {
      const issue = await detectServerComponentIssue(page, url);
      if (issue.detected) {
        console.log(`  ⚠  ${issue.reason}`);
        console.log(`     → Try running with --preview-page flag for Server Component projects`);
      } else {
        console.log(`  No [data-strapi-uid] elements found after ${WAIT_TIMEOUT}ms`);
      }
      return;
    }

    const elements = await page.locator('[data-strapi-uid]').all();
    console.log(`  Found ${elements.length} block element(s)`);

    for (const el of elements) {
      const uid = await el.getAttribute('data-strapi-uid');
      if (!uid) continue;
      allSeen.add(uid);

      if (alreadyCaptured.has(uid)) {
        if (!skipped.includes(uid)) { skipped.push(uid); console.log(`  ↩ ${uid} — already captured`); }
        continue;
      }
      if (newlyCaptured[uid]) continue;

      const box = await el.boundingBox();
      if (!box || box.width < 10 || box.height < 10) {
        console.log(`  ✗ ${uid} — zero/tiny bounding box (hidden or not rendered)`);
        missed.add(uid);
        continue;
      }

      const isVisible = await el.isVisible();
      if (!isVisible) {
        console.log(`  ✗ ${uid} — not visible`);
        missed.add(uid);
        continue;
      }

      try {
        await el.screenshot({ path: path.join(OUTPUT_DIR, `${uid}.png`), type: 'png' });
        newlyCaptured[uid] = true;
        console.log(`  ✓ ${uid}`);
      } catch (err) {
        console.log(`  ✗ ${uid} — screenshot failed: ${err.message}`);
        missed.add(uid);
      }
    }
  } catch (err) {
    console.log(`  Error on ${url}: ${err.message}`);
  }
}

// ── Validate the homepage before committing to full crawl ────────────────────

async function validateHomepage(browser) {
  console.log('\nValidating homepage before crawl...');
  const page = await browser.newPage();

  try {
    await page.goto(WEBSITE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
    const found = await waitForStrapiElements(page);

    if (!found) {
      const issue = await detectServerComponentIssue(page, WEBSITE_URL + '/');

      console.log('\n⚠  VALIDATION FAILED — no [data-strapi-uid] elements found on homepage');
      console.log('');

      if (issue.detected) {
        console.log('Likely cause: ' + issue.reason);
        console.log('');
        console.log('This happens when:');
        console.log('  • Components are Server Components and the wrapper div never reaches the client DOM');
        console.log('  • Suspense boundaries delay hydration beyond the wait timeout');
        console.log('  • The renderer patch was applied to the wrong file');
        console.log('');
        console.log('Solutions:');
        console.log('  1. Mark the wrapper as a Client Component — add "use client" to RenderBlocks.tsx');
        console.log('     and ensure the data-strapi-uid div is rendered client-side');
        console.log('  2. Run with --preview-page flag to use a dedicated preview page instead');
        console.log(`  3. Increase wait timeout: --wait-timeout 30000 (current: ${WAIT_TIMEOUT}ms)`);
        console.log('  4. Check /tmp/strapify-website.log to confirm dev server rendered the page');
      } else {
        console.log('The renderer patch may not be active. Check that:');
        console.log('  • The patch was applied to the correct file');
        console.log('  • The dev server restarted/reloaded after patching');
        console.log('  • The homepage actually renders Strapi-driven blocks');
      }

      await page.close();
      return false;
    }

    const count = await page.locator('[data-strapi-uid]').count();
    console.log(`✓ Validation passed — found ${count} [data-strapi-uid] element(s) on homepage`);
    await page.close();
    return true;
  } catch (err) {
    console.log(`Validation error: ${err.message}`);
    await page.close();
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const alreadyCaptured = loadAlreadyCaptured();
  const { chromium } = playwright;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  let urls;

  if (USE_PREVIEW_PAGE) {
    // Skip homepage validation — go straight to the dedicated preview page
    console.log('\n--preview-page: capturing from /strapify-preview');
    urls = [WEBSITE_URL + '/strapify-preview'];
  } else {
    // Fast-fail: validate homepage before crawling everything
    const valid = await validateHomepage(context.browser() || browser);
    if (!valid) {
      await browser.close();
      const result = {
        captured: [...alreadyCaptured],
        newlyCaptured: [],
        skipped: [],
        missed: [],
        reasons: {},
        validationFailed: true,
        validationError: 'No [data-strapi-uid] elements found on homepage — see console output above for guidance',
      };
      fs.writeFileSync(path.join(OUTPUT_DIR, 'capture-result.json'), JSON.stringify(result, null, 2));
      process.exit(1);
    }

    urls = await fetchSitemapUrls(browser, WEBSITE_URL);
  }

  const newlyCaptured = {};
  const missed = new Set();
  const allSeen = new Set();
  const skipped = [];

  for (const url of urls) {
    console.log(`\nCrawling: ${url}`);
    const page = await context.newPage();
    await capturePage(page, url, alreadyCaptured, newlyCaptured, missed, allSeen, skipped);
    await page.close();
  }

  await browser.close();

  const allCapturedUids = [...Array.from(alreadyCaptured), ...Object.keys(newlyCaptured)];
  const missedUids = [...missed].filter((uid) => !newlyCaptured[uid] && !alreadyCaptured.has(uid));

  const result = {
    captured: allCapturedUids,
    newlyCaptured: Object.keys(newlyCaptured),
    skipped,
    missed: missedUids,
    reasons: Object.fromEntries(
      missedUids.map((uid) => [uid, allSeen.has(uid)
        ? 'element had zero height or was not visible'
        : 'not rendered on any crawled page'
      ])
    ),
    validationFailed: false,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'capture-result.json'), JSON.stringify(result, null, 2));

  console.log('\n─────────────────────────────────');
  console.log(`Newly captured: ${Object.keys(newlyCaptured).length}`);
  console.log(`Already had:    ${skipped.length}`);
  console.log(`Total:          ${allCapturedUids.length}`);
  console.log(`Missed:         ${missedUids.length}`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
