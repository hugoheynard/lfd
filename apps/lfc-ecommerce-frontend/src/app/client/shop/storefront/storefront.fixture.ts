import type { PublicStorefrontObjectView, StorefrontContent } from '@lfd/contracts';

/**
 * Les pièces de vitrine des suites — la forme exacte que sert
 * `GET /shop/storefront/:shelfKey`, typée par le contrat : un champ renommé
 * côté serveur fait rougir ici.
 */

export const NOEL: Extract<StorefrontContent, { kind: 'info' }> = {
  kind: 'info',
  badge: { fr: 'Noël · J‑18', en: 'Christmas · D‑18' },
  title: { fr: 'Le rayon de Noël', en: 'The Christmas shelf' },
  lede: { fr: 'Bûches et papillotes.' },
  image: { url: 'https://example.test/buche.jpg', alt: { fr: 'Une bûche' } },
  linkShelfKey: 'cat_patis',
};

export const productContent = (sku: string): StorefrontContent => ({ kind: 'product', sku });

export function storefrontObject(
  overrides: Partial<PublicStorefrontObjectView> & Pick<PublicStorefrontObjectView, 'id'>,
): PublicStorefrontObjectView {
  return {
    shape: 'tile',
    column: 1,
    row: 1,
    applyOnMobile: true,
    mediaFit: 'cover',
    mediaSide: 'left',
    carousel: null,
    tone: 'dark',
    contents: [NOEL],
    ...overrides,
  };
}
