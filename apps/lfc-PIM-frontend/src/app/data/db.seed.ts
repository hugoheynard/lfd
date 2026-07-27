import type {
  Category,
  FiscalCategory,
  Product,
  ProductBinding,
  SalesChannels,
} from './models';

/**
 * La **DB en dur du POC** — versionnée dans le repo, embarquée dans le build.
 *
 * C'est elle qui s'affiche sur une machine vierge (démo GitHub Pages) : aucun
 * backend, aucun localStorage préalable. Les actions du front écrivent ensuite
 * une copie dans le localStorage de la machine ; {@link LocalDb.reset} y revient.
 *
 * Pour figer un nouvel état de démo : « Réinitialiser » puis éditer, exporter le
 * JSON depuis les réglages, et recopier ici.
 */
export interface DbShape {
  readonly categories: Category[];
  readonly products: Product[];
  readonly bindings: ProductBinding[];
  /** Dernière empreinte poussée par produit — sert à détecter « déjà à jour ». */
  readonly bindingHashes: Record<string, string>;
  readonly shopify: {
    shopDomain: string;
    apiVersion: string;
    isEnabled: boolean;
    updatedAt: string | null;
  };
}

/** À emporter dans les deux boutiques, jamais en salle — le défaut courant. */
const EMPORTER_ONLY: SalesChannels = {
  b1: { emporter: true, surPlace: false },
  b2: { emporter: true, surPlace: false },
};

function category(
  id: string,
  fr: string,
  slug: string,
  position: number,
  fiscalCategory: FiscalCategory,
  channelPreset: SalesChannels = EMPORTER_ONLY,
): Category {
  return {
    id,
    name: { fr },
    slug: { fr: slug },
    parentId: null,
    position,
    isArchived: false,
    fiscalCategory,
    channelPreset,
  };
}

function product(
  id: string,
  sku: string,
  fr: string,
  kind: Product['kind'],
  categoryId: string,
  status: Product['status'],
  allergens: string[] | null,
  channelsOverride: SalesChannels | null = null,
): Product {
  return {
    id,
    sku,
    name: { fr },
    kind,
    categoryId,
    status,
    channelsOverride,
    variants: [
      {
        id: `${id}_v1`,
        sku: `${sku}-1`,
        name: { fr },
        isDefault: true,
        isDiscontinued: false,
        allergens,
      },
    ],
  };
}

function binding(
  productId: string,
  syncStatus: ProductBinding['syncStatus'],
  lastPushedAt: string | null,
  lastError: string | null = null,
): ProductBinding {
  return { productId, syncStatus, lastPushedAt, lastError };
}

// blé = AW · lait = AM · œuf = AE  (codes GS1 du référentiel allergènes)
export const DB_SEED: DbShape = {
  categories: [
    category('cat_vien', 'Viennoiseries', 'viennoiseries', 1, 'viennoiserie'),
    category('cat_patis', 'Pâtisseries', 'patisseries', 2, 'patisserie'),
    category('cat_pains', 'Pains', 'pains', 3, 'pain'),
    category('cat_choco', 'Chocolat & confiserie', 'chocolat-confiserie', 4, 'chocolat-confiserie'),
  ],
  // Croissant : aussi servi en salle à Village. Éclair : en salle dans les deux.
  products: [
    product('prd_croissant', 'VIEN-CROISS-BEURR', 'Croissant au beurre', 'daily', 'cat_vien', 'published', ['AW', 'AM', 'AE'], { b1: { emporter: true, surPlace: true }, b2: { emporter: true, surPlace: false } }),
    product('prd_painchoc', 'VIEN-PAIN-CHOCO', 'Pain au chocolat', 'daily', 'cat_vien', 'published', ['AW', 'AM', 'AE']),
    product('prd_chausson', 'VIEN-CHAUSS-POMME', 'Chausson aux pommes', 'daily', 'cat_vien', 'draft', ['AW', 'AM']),
    product('prd_tarte', 'PATI-TARTE-MYRTI', 'Tarte aux myrtilles', 'made_to_order', 'cat_patis', 'published', ['AW', 'AM', 'AE']),
    product('prd_eclair', 'PATI-ECLAIR-CHOCO', 'Éclair au chocolat', 'daily', 'cat_patis', 'published', ['AW', 'AM', 'AE'], { b1: { emporter: true, surPlace: true }, b2: { emporter: true, surPlace: true } }),
    product('prd_baguette', 'PAIN-BAGUET-TRADI', 'Baguette tradition', 'daily', 'cat_pains', 'published', ['AW']),
    product('prd_seigle', 'PAIN-SEIGLE', 'Pain de seigle', 'daily', 'cat_pains', 'draft', null),
    product('prd_mendiants', 'CHOC-MENDIANT', 'Mendiants', 'resale', 'cat_choco', 'published', ['AM', 'AN']),
  ],
  bindings: [
    binding('prd_croissant', 'up_to_date', '2026-07-24T06:12:00.000Z'),
    binding('prd_painchoc', 'up_to_date', '2026-07-24T06:12:00.000Z'),
    binding('prd_tarte', 'drifted', '2026-07-20T09:30:00.000Z'),
    binding('prd_eclair', 'failed', '2026-07-22T07:45:00.000Z', 'Variante sans référence : SKU manquant côté Shopify.'),
    binding('prd_baguette', 'never_pushed', null),
  ],
  bindingHashes: {},
  shopify: {
    shopDomain: 'chevallot.myshopify.com',
    apiVersion: '2026-07',
    isEnabled: false,
    updatedAt: null,
  },
};
