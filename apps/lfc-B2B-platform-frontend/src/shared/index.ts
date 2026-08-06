/**
 * Shared UI library — the staging area for components authored to `fold-ng`
 * conventions (signals, standalone, zoneless- and SSR-safe, design tokens only)
 * so they can move into the published `fold-ng` package unchanged.
 *
 * Building blocks are shared, not duplicated: `fold-action` (the CTA/button
 * primitive) is consumed by both the banner carousel and the product card.
 */
export * from './fold-action';
export * from './fold-banner-carousel';
export * from './fold-product-card';
// Carte produit **app-owned** (mise en page libre dans ce repo), distincte de la
// `fold-product-card` écrite pour migrer dans `fold-ng`.
export * from './product-card';
// Rangée order-pad compacte (réappro dense) — app-owned.
export * from './product-row';
