import type {
  BoutiqueChannels,
  Category,
  Emplacement,
  Product,
  SalesChannels,
  TvaRate,
} from './models';
import { slugify } from './sku';

/**
 * Les **noms** des emplacements qui proposent un mode donné.
 *
 * Il lisait deux libellés codés en dur, dont l'un ne correspondait à aucun
 * emplacement du référentiel : l'écran affichait une boutique qui n'existait
 * pas. Les noms viennent maintenant de la liste qu'on lui passe, et une clé
 * qui ne désigne plus rien est simplement ignorée.
 */
export function boutiquesWith(
  channels: SalesChannels,
  mode: keyof BoutiqueChannels,
  emplacements: readonly Emplacement[],
): string[] {
  return emplacements
    .filter((emplacement) => channels.boutiques[emplacement.id]?.[mode] === true)
    .map((emplacement) => emplacement.name);
}

/** Un mode est-il vendu **quelque part** ? Le taux suit le mode, pas la boutique. */
export function sellsMode(channels: SalesChannels, mode: keyof BoutiqueChannels): boolean {
  return Object.values(channels.boutiques).some((modes) => modes[mode]);
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
 * Le handle de la collection Shopify d'un taux — **dérivé** du taux, et non
 * lu sur le taux : le référentiel fiscal ne porte plus de vocabulaire de
 * canal. C'est ici, dans la projection Shopify, qu'il se recalcule.
 */
function tagOf(rate: TvaRate | undefined): string {
  return rate === undefined ? '—' : tvaTagFromPercent(rate.percent);
}

function rateOf(rate: TvaRate | undefined): string {
  return rate === undefined ? '—' : formatPercent(rate.percent);
}

/**
 * Les fiches Shopify qu'une recette produit au push, dérivées de ses canaux et
 * des taux de TVA de sa catégorie. Une recette → 0, 1 ou 2 fiches (emporter
 * et/ou sur place). Le taux/tag vient du taux référencé — l'exception chocolat
 * (20 % sur place) n'est plus une règle codée, juste `surPlaceTvaId = tva-20`.
 */
export function generateFiches(
  product: Product,
  category: Category,
  regimeById: ReadonlyMap<string, TvaRate>,
  emplacements: readonly Emplacement[],
): GeneratedFiche[] {
  const { channels } = resolveChannels(product, category);
  const handle = slugify(product.name.fr);
  const fiches: GeneratedFiche[] = [];

  const emporter = boutiquesWith(channels, 'emporter', emplacements);
  if (emporter.length > 0) {
    const rate = regimeById.get(category.emporterTvaId);
    fiches.push({
      mode: 'emporter',
      title: product.name.fr,
      handle,
      boutiques: emporter,
      tvaTag: tagOf(rate),
      tvaRate: rateOf(rate),
    });
  }

  const surPlace = boutiquesWith(channels, 'surPlace', emplacements);
  if (surPlace.length > 0) {
    const rate = regimeById.get(category.surPlaceTvaId);
    fiches.push({
      mode: 'surPlace',
      title: `${product.name.fr} (sur place)`,
      handle: `${handle}-sur-place`,
      boutiques: surPlace,
      tvaTag: tagOf(rate),
      tvaRate: rateOf(rate),
    });
  }

  return fiches;
}
