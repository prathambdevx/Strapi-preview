# Strapi Version Guide

How to detect Strapi version and use the correct admin panel code.

## Detect Version

```bash
STRAPI_VERSION=$(node -e "const p = require('$STRAPI_REPO/package.json'); const v = (p.dependencies || {})['@strapi/strapi'] || (p.devDependencies || {})['@strapi/strapi'] || ''; console.log(v.match(/^[~^]?(\d+)/)?.[1] || '5')")
```

## API Differences

| | Strapi 5 | Strapi 4 |
|---|---|---|
| **app.tsx API** | `addEditViewSidePanel([Component])` | `injectContentManagerComponent('editView', 'right-links', {...})` |
| **Component returns** | `{ title: string, content: ReactNode }` | JSX directly |
| **Data access hook** | `unstable_useContentManagerContext` + `useForm` | `useCMEditViewDataManager` |
| **Template files** | `ComponentPreviewPanel.tsx.template` + `admin-app.tsx.template` | `ComponentPreviewPanel-v4.tsx.template` + `admin-app-v4.tsx.template` |

## Template Selection

```bash
if [ "$STRAPI_VERSION" = "4" ]; then
  PANEL_TEMPLATE="ComponentPreviewPanel-v4.tsx.template"
  APP_TEMPLATE="admin-app-v4.tsx.template"
else
  PANEL_TEMPLATE="ComponentPreviewPanel.tsx.template"
  APP_TEMPLATE="admin-app.tsx.template"
fi
```

## Common Errors from Version Mismatch

| Error | Cause | Fix |
|---|---|---|
| "Objects are not valid as a React child" | v5 `{title, content}` component used with v4 `injectContentManagerComponent` | Swap to v4 templates |
| "Cannot read properties of undefined (reading 'apis')" | v5 API `getPlugin('content-manager').apis` used in v4 | Swap to v4 templates |
| "injectContentManagerComponent is not a function" | v4 API used in v5 | Swap to v5 templates |
| "useCMEditViewDataManager is not a function" | v4 hook used in v5 | Swap to v5 templates |
