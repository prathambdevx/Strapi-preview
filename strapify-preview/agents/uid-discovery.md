# Agent: uid-discovery

Discovers the mapping between Strapi component UIDs and rendered blocks in any frontend framework.

## Goal

Produce a list of all Strapi component UIDs present in the website repo, grouped by page type, with enough information to generate the preview page.

## Output format

```json
{
  "strategy": "component-map | switch-statement | schema-files",
  "groups": [
    {
      "pageType": "home",
      "sourceFile": "src/components/DynamicPage/HomePage/index.ts",
      "mapExportName": "homePageComponentMap",
      "uids": [
        { "typename": "ComponentCommonHeroBanner", "uid": "common.hero-banner" }
      ]
    },
    {
      "pageType": "product",
      "sourceFile": "src/components/DynamicPage/ProductPage/index.ts",
      "mapExportName": "productPageComponentMap",
      "uids": [
        { "typename": "ComponentProductDetails", "uid": "product.product-details" }
      ]
    }
  ]
}
```

## Detection steps

Work through these strategies in order. Stop at the first one that yields results.

### Strategy 1 — ComponentMap pattern (React/Next.js)

```bash
grep -rl "ComponentMap\|componentMap" <WEBSITE_REPO>/src --include="*.tsx" --include="*.ts" 2>/dev/null
```

Read those files. Extract all `Component*` keys. Group by which map file they came from.

**UID conversion rule:**
```
ComponentCommonHeroBanner
  → strip "Component"      → CommonHeroBanner
  → first PascalWord       → Common (category)
  → kebab-case the rest    → hero-banner
  → join with dot          → common.hero-banner
```

Alternatively, run:
```bash
node <PLUGIN_DIR>/scripts/extract-uids.js --repo <WEBSITE_REPO>
```

### Strategy 2 — Switch/case or if-chains on __typename

```bash
grep -rl "__typename" <WEBSITE_REPO>/src --include="*.tsx" --include="*.ts" --include="*.vue" --include="*.svelte" 2>/dev/null
```

Extract string literals compared against `__typename`. Apply UID conversion.

### Strategy 3 — Strapi schema files as ground truth

```bash
find <STRAPI_REPO>/src/components -name "*.json"
```

Each path `src/components/common/hero-banner.json` → UID `common.hero-banner`.
