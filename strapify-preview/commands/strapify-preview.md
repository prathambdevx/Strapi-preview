# /strapify-preview

Capture real website screenshots of every Strapi CMS component and install a live preview panel in the Strapi 5 admin.

## Trigger

```
/strapify-preview
/strapify-preview --force
```

Use `--force` to recapture all screenshots even if they already exist.

## What this command does

Runs the full strapify-preview workflow end to end — fully autonomous, no questions asked:

1. Locates the website and Strapi repos automatically
2. Discovers all component UIDs from the website's component maps
3. Creates a temporary `/strapify-preview` page that renders every component with real CMS data
4. Ensures dev servers are running
5. Captures a screenshot of each component using Playwright
6. Removes the temporary page — website repo fully restored
7. Updates Strapi component schemas with `info.preview`
8. Writes `manifest.json` for incremental future runs
9. Installs the Component Preview side panel in Strapi 5 admin
10. Rebuilds and restarts Strapi
11. Prints the final capture report

## Zero questions policy

This command does NOT ask for confirmation at any step. It:
- Finds repos by searching the filesystem
- Starts servers if they're not running
- Fixes rendering errors in the preview page automatically
- Skips components that won't render
- Installs everything and rebuilds

The ONLY question it will ever ask: "Where are the repos?" — and only if it truly cannot find them.

## Execution

When this command is triggered, load and follow:
- `skills/strapi-component-previews.md` — full phase-by-phase instructions

All scripts are in `scripts/` relative to this plugin.
