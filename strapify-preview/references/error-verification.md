# Error Verification Guide

## Build Success = Admin Works

A successful `npm run build` (exit code 0) guarantees the admin panel will load without runtime errors. **No Playwright verification is needed.**

If the build fails, the only common cause is a Strapi version mismatch in the templates:

| Error in build output | Cause | Fix |
|---|---|---|
| `addEditViewSidePanel is not a function` | v5 template used with Strapi v4 | Swap to v4 templates |
| `injectContentManagerComponent is not a function` | v4 template used with Strapi v5 | Swap to v5 templates |
| `Cannot find module '@strapi/content-manager/strapi-admin'` | v5 import used in v4 | Swap to v4 templates |
| `useCMEditViewDataManager is not defined` | v4 hook used in v5 | Swap to v5 templates |

Fix: re-detect version, swap templates (see `strapi-version-guide.md`), rebuild.

## Quick Smoke Test (optional)

If you want a fast sanity check after starting Strapi:

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 15 "http://localhost:$STRAPI_PORT/admin/"
```

Should return 200. That's sufficient.

## Preview Page Rendering Issues

If components have zero height during capture:
- They likely need data that wasn't fetched, or render conditionally
- Check if the Strapi content type actually has data configured for the handles you used
- Try adding more page handles from different page templates (Phase 2)
- If not fixable, skip them — list as "missed" in final report
