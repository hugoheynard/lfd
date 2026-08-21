import { BOUTIQUE_LABEL } from './boutiques';
import type { BoutiqueChannels, Category, Product, SalesChannels, TvaRegime } from './models';
import { slugify } from './sku';

/** Libellés des boutiques qui proposent un mode donné (à emporter / sur place). */
export function boutiquesWith(channels: SalesChannels, mode: keyof BoutiqueChannels): string[] {
  const result: string[] = [];
  if (channels.b1[mode]) {
    result.push(BOUTIQUE_LABEL.b1);
  }
  if (channels.b2[mode]) {
    result.push(BOUTIQUE_LABEL.b2);
  }
  return result;
}

/** `5.5` → « 5,5 % » ; `10` → « 10 % ». Affichage FR. */
export function formatPercent(percent: number): string {
  return `${percent.toString().replace('.', ',')} %`;
}

/** Handle de la collection Shopify dérivé du taux : `5.5` → `tva-5-5`. */
export function tvaTagFromPercent(percent: number): string {
  return `tva-${percent.toString().replace('.', '-')}`;
}

export interface ResolvedChannels {
  channels: SalesChannels;
  /** `true` = valeur héritée de la gamme ; `false` = override du produit. */
  isInherited: boolean;
}

/** Canaux effectifs d'un produit : son override, sinon le défaut de sa gamme. */
export function resolveChannels(product: Product, category: Category): ResolvedChannels {
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

/**
 * Le handle de la collection Shopify d'un régime — **dérivé** du taux, et non
 * lu sur le régime : le référentiel fiscal ne porte plus de vocabulaire de
 * canal. C'est ici, dans la projection Shopify, qu'il se recalcule.
 */
function tagOf(regime: TvaRegime | undefined): string {
  return regime === undefined ? '—' : tvaTagFromPercent(regime.percent);
}

function rateOf(regime: TvaRegime | undefined): string {
  return regime === undefined ? '—' : formatPercent(regime.percent);
}

/**
 * Les fiches Shopify qu'une recette produit au push, dérivées de ses canaux et
 * des régimes de TVA de sa catégorie. Une recette → 0, 1 ou 2 fiches (emporter
 * et/ou sur place). Le taux/tag vient du régime référencé — l'exception chocolat
 * (20 % sur place) n'est plus une règle codée, juste `surPlaceTvaId = tva-20`.
 */
export function generateFiches(
  product: Product,
  category: Category,
  regimeById: ReadonlyMap<string, TvaRegime>,
): GeneratedFiche[] {
  const { channels } = resolveChannels(product, category);
  const handle = slugify(product.name.fr);
  const fiches: GeneratedFiche[] = [];

  const emporter = boutiquesWith(channels, 'emporter');
  if (emporter.length > 0) {
    const regime = regimeById.get(category.emporterTvaId);
    fiches.push({
      mode: 'emporter',
      title: product.name.fr,
      handle,
      boutiques: emporter,
      tvaTag: tagOf(regime),
      tvaRate: rateOf(regime),
    });
  }

  const surPlace = boutiquesWith(channels, 'surPlace');
  if (surPlace.length > 0) {
    const regime = regimeById.get(category.surPlaceTvaId);
    fiches.push({
      mode: 'surPlace',
      title: `${product.name.fr} (sur place)`,
      handle: `${handle}-sur-place`,
      boutiques: surPlace,
      tvaTag: tagOf(regime),
      tvaRate: rateOf(regime),
    });
  }

  return fiches;
}
