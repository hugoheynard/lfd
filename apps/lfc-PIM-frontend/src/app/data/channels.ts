import { BOUTIQUE_LABEL } from './boutiques';
import type {
  BoutiqueChannels,
  Category,
  FiscalCategory,
  Product,
  SalesChannels,
} from './models';
import { slugify } from './sku';

/** Libellés des boutiques qui proposent un mode donné (à emporter / sur place). */
export function boutiquesWith(
  channels: SalesChannels,
  mode: keyof BoutiqueChannels,
): string[] {
  const result: string[] = [];
  if (channels.b1[mode]) {
    result.push(BOUTIQUE_LABEL.b1);
  }
  if (channels.b2[mode]) {
    result.push(BOUTIQUE_LABEL.b2);
  }
  return result;
}

/**
 * Le croisement `(catégorie fiscale × canal) → taux`. C'est ici — et **nulle
 * part ailleurs** — que vit l'exception chocolat (20 % même en salle). Une case
 * « sur place → tva-10 » brute la casserait.
 */
const TVA: Record<FiscalCategory, { emporter: string; surPlace: string }> = {
  viennoiserie: { emporter: '5,5 %', surPlace: '10 %' },
  pain: { emporter: '5,5 %', surPlace: '10 %' },
  patisserie: { emporter: '5,5 %', surPlace: '10 %' },
  'sale-traiteur': { emporter: '5,5 %', surPlace: '10 %' },
  'chocolat-confiserie': { emporter: '20 %', surPlace: '20 %' },
};

export const FISCAL_LABELS: Record<FiscalCategory, string> = {
  viennoiserie: 'Viennoiserie',
  pain: 'Pain',
  patisserie: 'Pâtisserie',
  'sale-traiteur': 'Salé & traiteur',
  'chocolat-confiserie': 'Chocolat & confiserie',
};

/** Les régimes fiscaux, dans l'ordre d'affichage. */
export const FISCAL_CATEGORIES: readonly FiscalCategory[] = [
  'viennoiserie',
  'pain',
  'patisserie',
  'sale-traiteur',
  'chocolat-confiserie',
];

/** Taux à emporter / sur place d'un régime fiscal (le chocolat reste 20/20). */
export function tvaFor(category: FiscalCategory): {
  emporter: string;
  surPlace: string;
} {
  return TVA[category];
}

export interface ResolvedChannels {
  channels: SalesChannels;
  /** `true` = valeur héritée de la gamme ; `false` = override du produit. */
  isInherited: boolean;
}

/** Canaux effectifs d'un produit : son override, sinon le défaut de sa gamme. */
export function resolveChannels(
  product: Product,
  category: Category,
): ResolvedChannels {
  if (product.channelsOverride === null) {
    return { channels: category.channelPreset, isInherited: true };
  }
  return { channels: product.channelsOverride, isInherited: false };
}

export type FicheMode = 'emporter' | 'surPlace';

export interface GeneratedFiche {
  mode: FicheMode;
  title: string;
  handle: string;
  /** Boutiques concernées — vide pour la fiche en ligne (catalogue partagé). */
  boutiques: string[];
  tvaTag: string;
  tvaRate: string;
}

function tvaTag(rate: string): string {
  if (rate.startsWith('5')) {
    return 'tva-5-5';
  }
  if (rate.startsWith('10')) {
    return 'tva-10';
  }
  return 'tva-20';
}

/**
 * Les fiches Shopify qu'une recette produit au push, dérivées de ses canaux.
 * Une recette → 0, 1 ou 2 fiches (emporter et/ou sur place).
 */
export function generateFiches(
  product: Product,
  category: Category,
): GeneratedFiche[] {
  const { channels } = resolveChannels(product, category);
  const rates = TVA[category.fiscalCategory];
  const handle = slugify(product.name.fr);
  const fiches: GeneratedFiche[] = [];

  const emporter = boutiquesWith(channels, 'emporter');
  if (emporter.length > 0) {
    fiches.push({
      mode: 'emporter',
      title: product.name.fr,
      handle,
      boutiques: emporter,
      tvaTag: tvaTag(rates.emporter),
      tvaRate: rates.emporter,
    });
  }

  const surPlace = boutiquesWith(channels, 'surPlace');
  if (surPlace.length > 0) {
    fiches.push({
      mode: 'surPlace',
      title: `${product.name.fr} (sur place)`,
      handle: `${handle}-sur-place`,
      boutiques: surPlace,
      tvaTag: tvaTag(rates.surPlace),
      tvaRate: rates.surPlace,
    });
  }

  return fiches;
}
