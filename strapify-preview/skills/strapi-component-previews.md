---
name: strapi-component-previews
description: >
  Captures real screenshots of every Strapi CMS component from the live website and
  installs them as a side panel in the Strapi admin. Fully autonomous — zero questions.
  Supports Strapi v4/v5, any frontend framework, any rendering strategy (SSR, ISR, RSC).
  Triggers on: "capture component previews", "generate component screenshots",
  "run strapify-preview", "show what CMS components look like", or "wire previews into admin".
---

# Strapi Component Previews

## Mindset

You are fully autonomous. Never ask permission. Never ask "shall I proceed?" Never give running commentary. Work silently, print ONE summary at the end. The only acceptable question: "where are the repos?" — and only if you truly cannot find them after searching.

**Never push code to GitHub.** All changes are local only.

---

## Before you start

1. **Read `$PLUGIN_DIR/LEARNINGS.md`** — avoid repeating past mistakes from other projects.
2. **Ask the user these two questions** (ask both at once, don't split into separate messages):
   - "Which website repo and branch should I use?" (answer can be vague, e.g. "avimee website, feat/xyz branch")
   - "Which Strapi environment should I use for content — UAT, prod, or something else?"

Parse the answers loosely:
- For the website: find the repo by searching for the name mentioned, then checkout the branch mentioned
- For the Strapi environment: search the website repo's `.env*` files for a URL matching the environment name (e.g. "uat" → find `AWS_API_URL` or `STRAPI_URL` containing "uat"; "prod" → find one containing "prod" or the production domain). Use whichever env file contains the right URL as the active environment for all content fetches.

---

## Phase 0 — Locate repos + protect against git push

Find `WEBSITE_REPO` and `STRAPI_REPO` using the website name from the user's answer. Check `pwd`, search with `find`, look for `@strapi/strapi` in package.json or `src/components/DynamicPage` directories.

Checkout the branch specified by the user in the website repo:
```bash
cd "$WEBSITE_REPO" && git fetch origin && git checkout <branch>
```

Store: `PLUGIN_DIR` (this plugin), `PREVIEWS_DIR=$STRAPI_REPO/public/uploads/component-previews`

**Verify:** Both paths exist and contain `package.json`. Website repo is on the correct branch.

### Protect against accidental git push

The settings path for a repo at `/path/to/repo` is:
`~/.claude/projects/<path-with-slashes-replaced-by-dashes>/settings.json`

For BOTH repos, ensure `"deny": ["Bash(git push*)"]` is present in settings.json. Read the current file and merge — do not overwrite other existing settings. If the file doesn't exist, create it with:

```json
{
  "permissions": {
    "deny": ["Bash(git push*)"]
  }
}
```

**Note:** This protects future sessions. In a `--dangerously-skip-permissions` session, the deny rule takes effect on the next session start — not immediately. Do not run `git push` in the current session.

---

## Phase 1 — Discover component UIDs

Search for component maps in the website repo:

```bash
grep -rl "ComponentMap\|componentMap" "$WEBSITE_REPO/src" --include="*.tsx" --include="*.ts" 2>/dev/null
```

Read those files. Extract every `Component*` key. Group by page type (home, product, collection, static, blog). See `references/preview-page-guide.md` for UID conversion rules.

Fallback: read Strapi schema files (`find "$STRAPI_REPO/src/components" -name "*.json"`).

**Verify:** You have a list of component typenames grouped by page type. Count should be >10 for a real project.

---

## Phase 2 — Discover 1 valid handle per page type + Understand data fetching

### 2a — Architecture sniff + Find data-fetching functions

**Run this first — takes 30 seconds, determines everything that follows:**

```bash
grep -E "STRAPI_URL|STRAPI_TOKEN|AWS_API|GRAPHQL_URL" $WEBSITE_REPO/.env* 2>/dev/null
```

Three outcomes:

| Result | Pattern | What to do |
|---|---|---|
| `STRAPI_URL` + `STRAPI_TOKEN` both present | Direct Strapi GraphQL | Use GraphQL queries in 2b to discover handles |
| `AWS_API_URL` or similar proxy var | Middleware/proxy | Read content service for function signatures; test individual resource endpoints directly |
| Neither | Unknown | Read content service file manually to find fetch pattern |

**If proxy pattern:** listing endpoints are usually auth-gated; individual resource lookups (`/pages/index`, `/products/{handle}`) usually aren't. Test a known handle immediately to confirm.

**If proxy pattern:** also check whether the root layout fetches data on mount (cart, auth, global config). If yes, isolate the preview page in its own route group with a minimal layout (e.g. `src/app/(strapify)/strapify-preview/page.tsx` + `src/app/(strapify)/layout.tsx`) to avoid interference.

Then read the content service file to extract:
- Function signatures (`getPage`, `getProduct`, `getCollection` or equivalent)
- Where product/collection template data lives (e.g. `product.strapi.page_template` vs `product.page_template`)
- Any context providers components need

### 2b — Discover valid CMS handles

Find **1 valid handle per dynamic page type** (1 screenshot per component UID, not per page).

**If using direct Strapi GraphQL:**

1. Find `STRAPI_URL` and `STRAPI_TOKEN` from the website's `.env` or `.env.local`.
2. Query for **1 handle per page type**:

```bash
# Homepage — always 'index'

# Product — find 1 page with type PRODUCT and grab its first linked product handle
curl -s "$STRAPI_URL/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STRAPI_TOKEN" \
  -d '{"query":"{ pages(filters:{page_type:{eq:\"PRODUCT\"}},pagination:{limit:1}) { handle products(pagination:{limit:1}) { handle } } }"}'
```

Use the `products[0].handle` from the result (NOT the page handle) as the `productHandle` parameter.

```bash
# Collection — find 1-2 templates with DIFFERENT block __typenames
curl -s "$STRAPI_URL/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STRAPI_TOKEN" \
  -d '{"query":"{ pages(filters:{page_type:{eq:\"COLLECTION\"}},pagination:{limit:3}) { handle collections(pagination:{limit:1}) { handle } blocks { __typename } } }"}'
```

Compare the `blocks[*].__typename` arrays. If two templates have different blocks, use both. If identical, use just one.

```bash
# Blog + Static pages — find 1 of each
curl -s "$STRAPI_URL/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STRAPI_TOKEN" \
  -d '{"query":"{ pages(pagination:{limit:20}) { handle page_type } }"}'
```

Pick 1 blog handle, and 2-3 static page handles that likely have different components (e.g. `about-us`, `faq`, `affiliate-program`).

3. Store the discovered handles for use in Phase 3.

**Verify:** You have at least 1 handle for homepage, product, collection, blog, and 2+ static pages.

---

## Phase 3 — Generate the preview page

Create a temporary `/strapify-preview` page in the website repo. **Full implementation details including error boundary pattern are in `references/preview-page-guide.md`.** Follow it exactly.

The page must:
- Be a **Server Component** (no `'use client'`) to fetch data at render time
- Fetch real CMS data via `Promise.allSettled` for every page type using handles from Phase 2
- Wrap EACH component in a **per-component error boundary** (`SafeBlockWrapper`) — this is mandatory
- Render every component wrapped in `<div data-strapi-uid="category.name">`
- Wrap product components in the appropriate context provider

**If the root layout loads data on mount (cart, auth, global configs):** create the preview page inside a route group with its own minimal layout, e.g. `src/app/(strapify)/strapify-preview/page.tsx` + `src/app/(strapify)/layout.tsx`. This prevents the root layout's data-fetching from blocking or crashing the preview page.

**Verify:** `curl` the preview page and count `data-strapi-uid` occurrences. Should be >0.

---

## Phase 4 — Ensure the website dev server is running + verify hydration

**Only the website server is needed.** Do NOT touch Strapi yet.

Detect on common ports (3000-3003, 4000, 5173, 8080). If not running, start it with the detected package manager. Wait up to 90s.

**Verify (both must pass):**

1. `curl` the preview page → `data-strapi-uid` count >0 in HTML.
2. Playwright diagnostic → `data-strapi-uid` count >0 after JS hydration.

If curl passes but Playwright shows 0 → hydration crash → error boundary is missing. See `references/preview-page-guide.md`.

---

## Phase 5 — Capture screenshots

Install Playwright in `/tmp`, then run:

```bash
node "$PLUGIN_DIR/scripts/capture-previews.js" \
  --website-url "http://localhost:$WEBSITE_PORT" \
  --output-dir "$PREVIEWS_DIR" \
  --playwright-dir "$PLAYWRIGHT_TMP" \
  --preview-page \
  --wait-timeout 30000
```

Always use `--preview-page`. If 0 captured, read errors, fix preview page, retry.

After capture, remove old placeholder screenshots (files not in capture-result.json AND <10KB).

Clean up: `rm -rf "$PLAYWRIGHT_TMP"`

**Verify:** `capture-result.json` exists and has >0 captured entries.

---

## Phase 6 — Restore the website repo

**Always run this, even if capture failed** (unless the user explicitly asks to preserve it).

Delete the preview page and its SafeBlockWrapper. Verify with `git status` — no changes should remain from this skill.

**Verify:** `git status` in the website repo shows no untracked or modified files from this skill.

---

## Phase 7 — Update Strapi schemas

```bash
node "$PLUGIN_DIR/scripts/update-schemas.js" \
  --strapi-repo "$STRAPI_REPO" \
  --capture-result "$PREVIEWS_DIR/capture-result.json"
```

**Verify:** Script reports >0 schemas updated.

---

## Phase 8 — Write manifest

```bash
node "$PLUGIN_DIR/scripts/write-manifest.js" \
  --output-dir "$PREVIEWS_DIR" \
  --capture-result "$PREVIEWS_DIR/capture-result.json"
```

Ensure `component-previews` is not in `.gitignore`.

**Verify:** `manifest.json` exists and has items matching captured count.

---

## Phase 9 — Install the Strapi admin panel

### Detect Strapi version

```bash
STRAPI_VERSION=$(node -e "const p=require('$STRAPI_REPO/package.json');const v=(p.dependencies||{})['@strapi/strapi']||'';console.log(v.match(/^[~^]?(\d+)/)?.[1]||'5')")
```

### Copy the correct templates

- **v5**: `ComponentPreviewPanel.tsx.template` + `admin-app.tsx.template`
- **v4**: `ComponentPreviewPanel-v4.tsx.template` + `admin-app-v4.tsx.template`

If `app.tsx` already exists, use `patch-admin-app.js --strapi-version $STRAPI_VERSION`.

See `references/strapi-version-guide.md` for API differences and common version-mismatch errors.

**Verify:** `src/admin/app.tsx` and `src/admin/components/ComponentPreviewPanel.tsx` both exist.

---

## Phase 10 — Build Strapi and make it available

```bash
cd "$STRAPI_REPO" && npm run build
```

If build fails, check if wrong version templates were used. Fix and rebuild.

**A successful build guarantees the admin panel works.** No further verification is needed.

Then make Strapi available:

1. **Detect Strapi's port**: read `$STRAPI_REPO/.env` for `PORT=`. Default is 1337 but projects often override. Use this port for all curl health checks.
2. Check if Strapi is already running on the detected port.
2. **Detect the running mode:**
   - `ps aux | grep strapi` — look for `strapi develop` vs `strapi start`
   - `strapi develop` → hot-reloads after build. Done.
   - `strapi start` → does NOT hot-reload. Must kill the process and restart:
     ```bash
     kill $STRAPI_PID
     cd "$STRAPI_REPO" && $PM run develop > /tmp/strapi-dev.log 2>&1 &
     ```
     Wait for it to come up (poll `curl` on the admin URL until HTTP 200).
3. **Not running** → start it: `$PM run develop > /tmp/strapi-dev.log 2>&1 &`. Wait for it.

**Verify:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:$STRAPI_PORT/admin/` returns 200.

---

## Phase 11 — Final report

```
╔══════════════════════════════════════════════════╗
║          strapify-preview — Complete             ║
╠══════════════════════════════════════════════════╣
║ CAPTURED (<n>)                                   ║
║   ✓ common.hero-banner                           ║
║   ...                                            ║
╠══════════════════════════════════════════════════╣
║ NOT CAPTURED (<n>)                               ║
║   ✗ blog.hero-blog-carousel — zero height        ║
╠══════════════════════════════════════════════════╣
║ Strapi version:  v<4|5>                          ║
║ Website repo:    restored ✓                      ║
║ Admin panel:     installed ✓                     ║
║ Build:           successful ✓                    ║
╠══════════════════════════════════════════════════╣
║ Your component previews are now visible!         ║
║ → http://localhost:<port>/admin                  ║
╚══════════════════════════════════════════════════╝
```

Then send this message to the user:

> Component previews are now added. Check them at http://localhost:<port>/admin

---

## Incremental runs

The manifest.json system supports resuming: already-captured UIDs are skipped. Use `--force` to recapture all. If a run fails halfway, the next run picks up where it left off.

---

## After every run — Learnings + Self-improvement

### Step 1: Write to LEARNINGS.md

Append a dated, project-scoped entry to `$PLUGIN_DIR/LEARNINGS.md`:

```markdown
---

## YYYY-MM-DD — <project-name> (<strapi-repo-name> / <website-repo-name>)

**Project:** <brief description> (Strapi vX, framework, CMS setup)

### What worked
- ...

### Blockers encountered

1. **<blocker title> (cost: ~Xmin)**
   - What happened
   - **Fix:** What resolved it

### What could have been done better

Reflect on the run as if advising someone doing it next time. Go beyond blockers — think about wasted time, unnecessary steps, things that were discovered late that should have been discovered early, or structural improvements to the approach. Examples:
- "Should have sniffed the data-fetching architecture first before reading individual files"
- "Could have found valid handles from homepage block data instead of guessing"
- "Root layout interference was predictable — should check for data-fetching in layout before creating the preview page"

### Result
- X/Y components captured
- Missed reasons: ...
```

