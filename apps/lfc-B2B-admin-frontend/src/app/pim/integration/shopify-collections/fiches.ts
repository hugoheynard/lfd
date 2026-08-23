import { slugify } from '../../data/sku';
import { boutiquesWith, formatPercent, resolveChannels } from '../../data/channels';
import type { Category, Emplacement, Product, TvaRate } from '../../data/models';

/**
 * **Les fiches Shopify** qu'un produit engendre au push — et rien d'autre.
 *
 * Ce bloc vivait dans `data/channels.ts`, au milieu du vocabulaire du
 * référentiel. Or `tag`, `handle` et « fiche » ne sont pas des mots du
 * catalogue : ce sont ceux de Shopify. Le référentiel fiscal a déjà rendu son
 * `tag` pour la même raison — un taux de TVA est une donnée comptable, un
 * handle de collection est du vocabulaire de canal, et le second n'a pas à
 * faire partie du premier.
 *
 * Ce qui reste dans `data/channels.ts` est ce que six écrans du catalogue
 * lisent vraiment : où une gamme se vend, et comment l'afficher.
 */

/** Handle de la collection Shopify dérivé du taux : `5.5` → `tva-5-5`. */
export function tvaTagFromPercent(percent: number): string {
  return `tva-${percent.toString().replace('.', '-')}`;
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
