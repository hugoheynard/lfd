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
// Rangée order-pad compacte (réappro dense). PARTIE dans `@lfd/b2b-ui/catalog`
// le 2026-08-15, quand le back-office est devenu son deuxième consommateur : il
// avait commencé par la réécrire à la main. Ré-exportée ici pour que les écrans
// de cette app n'aient pas à savoir qu'elle a déménagé.
export { ProductRow as ProductRowComponent } from '@lfd/b2b-ui/catalog';
export type { CatalogOrder, CatalogProduct } from '@lfd/b2b-ui/catalog';
