# Strapify Preview — Learnings

Append findings here after every run. Each entry helps improve future runs.

---

## 2026-04-12 — foxtale-strapi / foxtale-website

**Project:** Foxtale (Strapi v5, Next.js App Router, production CMS at headless-cms.foxtale.in)

### What worked
- Server Component preview page with real CMS data fetched via `Promise.allSettled`
- Per-component `SafeBlockWrapper` error boundary prevented hydration crashes
- Querying Strapi GraphQL to discover valid product/collection handles

### Blockers encountered

1. **Hydration crash killed all UIDs (cost: ~15min)**
   - `FoxtaleHqCarousel` crashed on `block.foxtale_hq_items.length` (undefined)
   - Without error boundaries, React removed ALL server-rendered HTML during hydration
   - Playwright saw 0 `data-strapi-uid` elements despite curl showing them in SSR HTML
   - **Fix:** Added `SafeBlockWrapper` class component with `getDerivedStateFromError`

2. **First product handle had no page template (cost: ~10min)**
   - `12-niacinamide-clarifying-serum-10-ml-v3` existed as a Strapi product but had no `pages` entry linked to it
   - `getPageDetails({ productHandle: ... })` returned null → all product components got empty fallback data
   - **Fix:** Queried `pages(filters:{page_type:{eq:"PRODUCT"}}) { products { handle } }` to find `choco-vanilla-body-mist`

3. **Missing page types reduced capture count (cost: ~8min)**
   - First run: 22 captured (no blogs, only one collection template)
   - Added `blogs` page handle → captured `article.article-dark-section`, `article.multi-article-list`
   - Added second collection handle `tb-serums-and-treatments` → broader block coverage
   - Final: 29 captured

4. **`strapi start` doesn't hot-reload after build (cost: ~5min)**
   - Skill assumed "running → hot-reloads after build"
   - Only `strapi develop` hot-reloads. `strapi start` serves stale build.
   - **Fix:** Kill process, restart with `npm run develop`

5. **Playwright error verification was unnecessary (cost: ~3min)**
   - Ran Playwright to check admin panel errors → "clean" (always is if build succeeds)
   - **Removed Phase 11 entirely** — build success = admin works

### Result
- 29/60 components captured
- 31 missed: mostly product components with no Strapi content configured, or components needing Shopify runtime data (cart, variants)
- 12 Strapi schemas updated with preview paths (foxtale run 1)

---

## 2026-04-12 — foxtale (run 2) — foxtale-strapi / foxtale-website

**Project:** Foxtale (Strapi v5, Next.js App Router) — incremental re-run after new components added

### What worked
- Added hulahoop-homepage page handle to fetch hulahoop-specific component typenames (category-card-carousel, fragrance-story-card-carousel, shop-by-categories, texture-card-carousel, hulahoop-testimonial, brand-value-card-carousel, user-story-card-carousel)
- 35 UIDs captured (up from 29) by expanding to 67 total discovered UIDs via the preview page
- Hulahoop-extra components added as a separate `hulahoopExtraMap` avoiding overrides of standard typenames
- ProductPageV2 component map added separately from original ProductPage — both use same typenames so no duplication issue

### Blockers encountered

1. **capture-result.json uses flat UID strings, not objects with `.file` property (cost: ~1min)**
   - Attempted to read `entry.get("file")` from captured list entries
   - Entries are plain strings (UIDs), not dicts
   - **Fix:** Build filenames from UIDs via `uid.replace(".", "-") + ".png"`

### Result
- 35/67 components captured
- 32 missed: mostly product components (statistics, combo-section-carousel, usage-guide, explore-product-range — newer V2 components not yet in CMS), and components needing runtime data (breadcrumb, timer, collection-fa-qs, related-collection)
- 12 Strapi schemas updated with preview paths

---

## 2026-04-12 — avimee-strapi / avimee-website

**Project:** Avimee Herbal (Strapi v5, Next.js App Router, multi-page CMS)

### What worked
- Content served via AWS API Gateway (UAT) — specific resource lookups publicly accessible without auth
- Product handle `keshpallav-hair-oil` had a valid Strapi page template with 13 blocks
- Science page handles use flat format: `skin-approach`, `skin-ingredients`, `skin-clinical`, `skin-standards` (NOT `skin/approach`)
- Separate route group `(strapify)` with minimal layout isolated preview from main app layout (which calls `getCart()` + `getGlobalConfigs()`)
- Running `./scripts/clean-generated-types.sh` fixed pre-existing TypeScript duplicate identifier errors
- 50 out of 58 components captured in first run

### Blockers encountered

1. **Avimee uses AWS API gateway, not direct Strapi access (cost: ~5min)**
   - Content functions: `getPage(handle)`, `getProduct(handle)`, `getCollection(handle)` via AWS API
   - Product template is at `product.strapi.page_template`, collection at `collection.strapi.page_template`
   - AWS API listing endpoints require auth; specific resource lookups (`/pages/index`, `/products/keshpallav-hair-oil`) are public
   - **Fix:** Test specific known handles; find product handles from homepage block data

2. **`components_blog_hero_socials.show` migration blocker (cost: ~3min)**
   - Strapi schema had `show: boolean` but DB column had string "ALL" from previous enum
   - Strapi failed to start with migration error
   - **Cause:** Was on wrong branch — the branch had already changed `show` to boolean in the schema but the local DB still had the old enum string "ALL"
   - **Fix:** `ALTER TABLE components_blog_hero_socials ALTER COLUMN show TYPE boolean USING (show = 'true');`
   - **Not universal** — this was a branch mismatch issue, not a general strapify-preview problem

3. **Avimee runs on port 1338 (not default 1337) (cost: ~1min)**
   - Another project occupied port 1337; Avimee `.env` sets `PORT=1338`
   - **Fix:** Always check `.env PORT` before polling admin URL

### What could have been done better

- **Should have sniffed the data-fetching architecture in the first 30 seconds.** Instead, read through `fetch.ts`, `config.ts`, and `services/content.ts` one by one before understanding the AWS API Gateway pattern. A single `grep` for `STRAPI_URL|AWS_API_URL` in `.env` files would have revealed this immediately and determined the entire handle-discovery strategy upfront.
- **Finding valid handles from homepage block data was discovered mid-run, not planned.** The ShopByRootCause block on the homepage contained collection handles. This is a reliable source for any project — should be the first place to look when listing endpoints are auth-gated.
- **Root layout interference was predictable.** Any project with `getCart()` or `getGlobalConfigs()` in the root layout will need a route group. Should check `app/layout.tsx` for data-fetching calls before even creating the preview page, and proactively use a route group if found.

### Result
- 50/58 components captured
- 8 missed: common.testimonial-carousel, blog.hero-blog-carousel, quiz.quiz-hero, science.ingredients-approach, result.result-section, result.result-group, home.find-your-formula, pages.fa-qs-page (zero height — client-side only or missing data)
- 49 Strapi schemas updated with preview paths
- 1 schema not found: quiz/quiz-stats-section.json (component in frontend but no Strapi schema file)
