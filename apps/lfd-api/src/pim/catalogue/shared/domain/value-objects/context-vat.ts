import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import { sellsContext, type SalesChannels } from "./sales-channels.js";

/**
 * Le taux visé par une famille, **par clé de contexte**. Une clé absente n'est
 * pas un taux nul : c'est l'absence de réglage, et les deux se distinguent.
 */
export type ContextVat = Readonly<Record<string, string>>;

/**
 * Ce contexte est-il vendu par cette matrice ?
 *
 * **Une ligne, et aucune branche.** Elle en avait une — « si c'est le B2B, lire
 * le drapeau, sinon chercher le mode » — parce que la matrice séparait les deux.
 * Depuis qu'elle est un ensemble de paires, la question ne dépend plus de quel
 * contexte on regarde : le nom suffit, et personne n'a besoin de savoir lequel
 * a un lieu.
 */
export function contextIsSold(context: SalesContext, channels: SalesChannels): boolean {
  return sellsContext(channels, context.key);
}

/**
 * Le taux EFFECTIF d'un produit : sa dérogation par-dessus celle de sa famille.
 *
 * Une seule ligne, mais c'est LA règle de résolution, et elle vit ici pour
 * qu'il n'y en ait qu'une : deux canaux qui la réécriraient chacun de leur côté
 * factureraient un jour deux taux différents pour le même article.
 *
 * Contexte par contexte : un produit peut déroger en B2B et suivre sa famille
 * au comptoir. C'est le cas courant, pas l'exception.
 */
export function effectiveVat<T>(
  family: Readonly<Record<string, T>>,
  product: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  return { ...family, ...product };
}

/** Un taux effacé, dans la forme des faits `*.vat_changed` : il était, il n'est plus. */
export interface ErasedVat {
  readonly from: string;
  readonly to: null;
}

/**
 * Les taux qu'un geste a **effacés** — clé de contexte → `{ from, to: null }`.
 *
 * La forme est celle que `product_category.vat_changed` et
 * `product.vat_changed` portent déjà (`set-category-vat`, `set-product-vat`) :
 * fermer un canal efface le taux du contexte fermé, et la comptabilité doit le
 * relire comme n'importe quel autre changement de taux, sans apprendre une
 * seconde charge. Clés triées, comme chez les deux voisins.
 *
 * Seules les disparitions comptent : un taux qui change de valeur n'est pas un
 * effacement, et aucun geste de canaux n'en change.
 */
export function erasedVat(
  before: ContextVat,
  after: ContextVat,
): Readonly<Record<string, ErasedVat>> {
  return Object.fromEntries(
    Object.entries(before)
      .filter(([key]) => after[key] === undefined)
      // L'ordre des unités de code, celui du `.sort()` des deux voisins.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, from]) => [key, { from, to: null }] as const),
  );
}
