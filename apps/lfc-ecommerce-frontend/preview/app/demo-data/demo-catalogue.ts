import type { ShopCatalogueView, ShopImageView, ShopItemView } from '@lfd/contracts';

/**
 * **Le catalogue de démonstration de l'aperçu** — des produits fictifs, typés
 * comme `GET /shop/catalogue` les rend (plan `plan-textes-de-la-boutique.md`,
 * §10 B3 : « l'aperçu ne lit pas le vrai catalogue »).
 *
 * Ce qu'on regarde dans l'aperçu, ce sont les TEXTES de la boutique ; les
 * produits ne servent qu'à remplir le rayon et le panier comme ils le seront.
 * Les visuels sont ceux que la boutique publie déjà (`public/products/`),
 * servis par l'aperçu lui-même : aucune image ne vient d'ailleurs.
 *
 * Les prix sont en millicentimes HORS TAXE, comme le serveur les rend, et le
 * TTC est celui qu'il afficherait à 5,5 %.
 */

const SHELVES = [
  { id: 'demo-shelf-pastries', name: 'Viennoiseries', position: 0 },
  { id: 'demo-shelf-breads', name: 'Pains', position: 1 },
  { id: 'demo-shelf-cakes', name: 'Pâtisseries', position: 2 },
] as const;

/** Le taux de TVA des produits de démonstration, en pourcentage. */
export const DEMO_VAT_RATE_PERCENT = 5.5;

function picture(file: string, alt: string): ShopImageView {
  return { url: `/products/${file}`, alt, width: 400, height: 400 };
}

function item(
  sku: string,
  name: string,
  note: string | null,
  file: string,
  unitPriceMillicents: number,
  shelfId: string,
  isFeatured = false,
): ShopItemView {
  const image = picture(file, name);
  return {
    sku,
    name,
    note,
    image,
    thumbnail: image,
    unitPriceMillicents,
    unitPriceTtcCents: Math.round((unitPriceMillicents / 1000) * (1 + DEMO_VAT_RATE_PERCENT / 100)),
    vatRatePercent: DEMO_VAT_RATE_PERCENT,
    shelfId,
    isFeatured,
  };
}

export const DEMO_CROISSANT = 'DEMO-CROISSANT';
export const DEMO_BAGUETTE = 'DEMO-BAGUETTE';

export const DEMO_CATALOGUE: ShopCatalogueView = {
  shelves: SHELVES,
  items: [
    item(DEMO_CROISSANT, 'Croissant', 'Beurre AOP', 'croissant.svg', 120_000, SHELVES[0].id, true),
    item('DEMO-BRIOCHE', 'Brioche', null, 'brioche.svg', 280_000, SHELVES[0].id),
    item('DEMO-CHAUSSON', 'Chausson aux pommes', null, 'chausson.svg', 160_000, SHELVES[0].id),
    item(
      DEMO_BAGUETTE,
      'Baguette de tradition',
      'Levain naturel',
      'baguette.svg',
      125_000,
      SHELVES[1].id,
    ),
    item('DEMO-BOULE', 'Boule de campagne', null, 'boule.svg', 380_000, SHELVES[1].id),
    item('DEMO-ECLAIR', 'Éclair au chocolat', null, 'eclair.svg', 350_000, SHELVES[2].id),
    item('DEMO-COOKIE', 'Cookie', null, 'cookie.svg', 220_000, SHELVES[2].id),
  ],
  operations: [],
};

/** Le panier des parcours qui en portent un : deux articles, deux lignes. */
export const DEMO_CART: Readonly<Record<string, number>> = {
  [DEMO_CROISSANT]: 2,
  [DEMO_BAGUETTE]: 1,
};
