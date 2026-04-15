# Preview Page Generation Guide

Detailed reference for generating the `/strapify-preview` page in Phase 3.

## UID Conversion

Convert GraphQL typename to Strapi UID:

```
ComponentCommonHeroBanner
  → strip "Component"      → CommonHeroBanner
  → first PascalWord       → Common (category)
  → kebab-case the rest    → hero-banner
  → join with dot          → common.hero-banner
```

```tsx
function typenameToUid(typename: string): string {
  const n = typename.replace(/^Component/, '');
  let result = '';
  for (let i = 0; i < n.length; i++) {
    const c = n[i];
    if (c >= 'A' && c <= 'Z') {
      if (i > 0) result += '-';
      result += c.toLowerCase();
    } else {
      result += c;
    }
  }
  const dot = result.indexOf('-');
  return dot < 0 ? result : result.slice(0, dot) + '.' + result.slice(dot + 1);
}
```

## Page Structure

The preview page must:

1. **Import ALL component maps** — every map discovered in Phase 1
2. **Import data-fetching functions** — from the website's libs
3. **Import context providers** — any that components need (e.g. `ProductVariantProvider`)
4. **Create a SafeBlockWrapper error boundary** — see Error Boundary section below
5. **Fetch real data in parallel** using `Promise.allSettled` for ALL page types:
   - Homepage blocks (handle: `index`)
   - Product page blocks + product data (use a real product handle from Phase 2)
   - Collection page blocks + collection data (use 1-2 real collection handles from Phase 2)
   - Static pages: about-us, faq, affiliate-program, etc.
   - Blog page blocks (handle: `blogs` or whatever was found in Phase 2)
6. **Build block items** — for each block, resolve the component, generate a UID, deduplicate
7. **Render each component** wrapped in `<SafeBlockWrapper>` then `<div data-strapi-uid="...">`
8. **First line**: `// strapify-preview: temporary file — DO NOT COMMIT`

## Error Boundary (MANDATORY)

**Without this, the entire preview page breaks.** A single component crash during React hydration kills ALL server-rendered HTML — Playwright sees 0 elements.

Create a separate `SafeBlockWrapper.tsx` file alongside the preview page:

```tsx
// strapify-preview: temporary file — DO NOT COMMIT
'use client';

import React from 'react';

interface State {
  hasError: boolean;
}

export class SafeBlockWrapper extends React.Component<
  { uid: string; children: React.ReactNode },
  State
> {
  constructor(props: { uid: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      // Still emit the data-strapi-uid so the capture script knows this component exists
      // but has zero height (will be listed as "missed")
      return <div data-strapi-uid={this.props.uid} style={{ display: 'none' }} />;
    }
    return this.props.children;
  }
}
```

**Why `'use client'`:** Error boundaries must be class components. Class components must be client components in Next.js App Router. The preview page itself should be a Server Component (async function, no `'use client'`) so it can fetch data at render time.

### Common component crashes this prevents

| Component | Crash | Cause |
|---|---|---|
| `FoxtaleHqCarousel` | `Cannot read properties of undefined (reading 'length')` | `block.foxtale_hq_items` is undefined |
| `OurStorySection` | `Cannot read properties of undefined (reading 'map')` | Missing array field |
| Any component with `.map()` or `.length` | TypeError | Fallback block has no array data |

## Key Patterns

```tsx
// Merge all component maps into one lookup
const allMaps = {
  ...componentMap,           // generic (DynamicPage/index.tsx)
  ...homePageComponentMap,
  ...productPageComponentMap,
  ...collectionPageComponentMap,
  ...staticPageComponentMap,
  ...blogPageComponentMap,
};

// Identify which components need ProductVariantProvider
const productOnlyTypenames = new Set(Object.keys(productPageComponentMap));
```

The page should be a **Server Component** (async function, no `'use client'`) to fetch data at render time.

## Data Fetching — All Page Types

Fetch ALL page types in one `Promise.allSettled` call. Use the real handles discovered in Phase 2:

```tsx
const [
  homePageResult,
  productPageResult,
  productDataResult,
  collectionPageResult,
  collectionDataResult,
  collection2PageResult,   // second collection for broader block coverage
  collection2DataResult,
  aboutPageResult,
  faqPageResult,
  affiliatePageResult,
  blogsPageResult,
] = await Promise.allSettled([
  getPageDetails({ first: 12, pageHandle: 'index' }),
  getPageDetails({ productHandle: PRODUCT_HANDLE, first: 12 }),
  getProductDetails({ handle: PRODUCT_HANDLE, first: 12 }),
  getPageDetails({ collectionHandle: COLLECTION_HANDLE_1, first: 20 }),
  getCollectionDetails({ handle: COLLECTION_HANDLE_1, first: 250, second: 20 }),
  getPageDetails({ collectionHandle: COLLECTION_HANDLE_2, first: 20 }),
  getCollectionDetails({ handle: COLLECTION_HANDLE_2, first: 250, second: 20 }),
  getPageDetails({ first: 12, pageHandle: 'about-us' }),
  getPageDetails({ first: 12, pageHandle: 'faq' }),
  getPageDetails({ first: 12, pageHandle: 'affiliate-program' }),
  getPageDetails({ first: 12, pageHandle: 'blogs' }),
]);
```

**Why two collection handles?** Different collection page templates have different blocks. One might have `Timer` + `RelatedCollection`, another might have `CollectionFaQs`. Using two maximizes block coverage.

## Block Registry — Deduplication with Real Data

Process blocks from each page type, passing the correct context data:

```tsx
function processBlocks(blocks, pageType, collectionData, productData) {
  for (const block of blocks || []) {
    const typename = block?.__typename;
    if (!typename || !allMaps[typename]) continue;
    const uid = typenameToUid(typename);
    if (seen.has(uid)) continue;
    seen.add(uid);
    items.push({ typename, uid, block, pageType, collectionData, productData });
  }
}

// Process in this order (homepage first = most important components first)
processBlocks(homePageData?.blocks, PageTypeEnum.Index, null, null);
processBlocks(productPageData?.blocks, PageTypeEnum.Product, null, productData);
processBlocks(collectionPageData?.blocks, PageTypeEnum.Collection, collectionData, null);
processBlocks(collection2PageData?.blocks, PageTypeEnum.Collection, collection2Data, null);
processBlocks(aboutPageData?.blocks, PageTypeEnum.Page, null, null);
processBlocks(faqPageData?.blocks, PageTypeEnum.Page, null, null);
processBlocks(affiliatePageData?.blocks, PageTypeEnum.Page, null, null);
processBlocks(blogsPageData?.blocks, PageTypeEnum.Blog, null, null);

// Fallback: components not found in any fetched page get a bare block
for (const typename of Object.keys(allMaps)) {
  const uid = typenameToUid(typename);
  if (seen.has(uid)) continue;
  seen.add(uid);
  items.push({
    typename, uid,
    block: { __typename: typename, id: `preview-${typename}` },
    pageType: PageTypeEnum.Index,
    collectionData: null, productData: null,
  });
}
```

## Rendering Each Component

```tsx
{items.map(({ typename, uid, block, pageType, collectionData: cd, productData: pd }) => {
  const Component = allMaps[typename];
  if (!Component) return null;
  const needsProductCtx = productOnlyTypenames.has(typename);

  const inner = (
    <SafeBlockWrapper key={uid} uid={uid}>
      <div data-strapi-uid={uid}>
        <Suspense fallback={<div data-strapi-uid={uid} style={{ height: 1 }} />}>
          <Component
            block={block}
            page="strapify-preview"
            pageType={pageType}
            collectionData={cd}
            productData={pd}
            priority={false}
          />
        </Suspense>
      </div>
    </SafeBlockWrapper>
  );

  if (needsProductCtx) {
    return (
      <ProductVariantProvider key={uid}>
        {inner}
      </ProductVariantProvider>
    );
  }

  return inner;
})}
```

## Component Grouping by Page Type

- **Homepage** — from `homePageComponentMap` → fetch with `getPageDetails({ pageHandle: 'index' })`
- **Product** — from `productPageComponentMap` → fetch page + product data
- **Collection** — from `collectionPageComponentMap` → fetch page + collection data
- **Static** — from `staticPageComponentMap` → fetch FAQ, about-us, affiliate-program etc.
- **Blog** — from `blogPageComponentMap` → fetch blog data
- **Generic** — from `componentMap` → components not in any page get fallback data

## Context Providers

Product components almost always need wrapping:

```tsx
if (needsProductCtx) {
  return (
    <ProductVariantProvider>
      <SafeBlockWrapper uid={uid}>
        <div data-strapi-uid={uid}><Component {...props} /></div>
      </SafeBlockWrapper>
    </ProductVariantProvider>
  );
}
```

Search for providers: `grep -rl "Provider\|Context" "$WEBSITE_REPO/src/contexts" --include="*.tsx"`

## Debugging: 0 UIDs in Playwright but UIDs in curl

This means React hydration failed. Steps:

1. Run a Playwright diagnostic that listens for `pageerror` events
2. Look for `TypeError: Cannot read properties of undefined` — that's a component crash
3. Confirm you have `SafeBlockWrapper` error boundaries around each component
4. Check that the preview page is a Server Component (no `'use client'` on the page itself)
5. The `SafeBlockWrapper` must be `'use client'` (class components require it)
