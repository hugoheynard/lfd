import type { ProductionBatchSnapshot } from "../entities/production-day.snapshot.js";

/**
 * **Ce que le four a sorti d'un article** — des dérivés, jamais une colonne.
 *
 * Plan `documentation/fournil/la-fiche-d-atelier.md`, D2 : l'état
 * d'une ligne se DÉDUIT de ses fournées. Aucun « fait » n'est écrit à côté de la
 * somme — une seconde vérité à tenir en même temps finirait par la contredire.
 *
 * Des fonctions pures : la journée (gardes) et la fiche d'atelier (lecture) les
 * appellent toutes les deux, pour que « sorti » ne se calcule qu'à un endroit.
 */

/** Les dérivés d'une ligne du compte à produire (D2). */
export interface LineOutput {
  /** Σ des fournées non annulées. */
  readonly produced: number;
  /** `max(0, quantity − produced)`. */
  readonly remaining: number;
  /** `max(0, produced − quantity)` — un écart, pas un stock (décision 4). */
  readonly surplus: number;
  /** `produced ≥ quantity` : « fait » se lit ici, sur les seules fournées. */
  readonly complete: boolean;
  /** La fournée qui a fait passer la ligne à complète, ou `null`. */
  readonly completedBy: ProductionBatchSnapshot | null;
}

/**
 * Les fournées qui COMPTENT pour un SKU, dans l'ordre de sortie — l'instant,
 * puis l'`id` pour que deux lectures rendent toujours le même ordre.
 */
export function activeBatchesOf(
  batches: readonly ProductionBatchSnapshot[],
  sku: string,
): readonly ProductionBatchSnapshot[] {
  return batches
    .filter((batch) => batch.sku === sku && batch.cancelled === null)
    .sort(
      (left, right) =>
        left.recorded.at.getTime() - right.recorded.at.getTime() || left.id.localeCompare(right.id),
    );
}

/** Les dérivés d'une ligne, à partir de ses fournées actives déjà triées. */
export function outputOf(quantity: number, active: readonly ProductionBatchSnapshot[]): LineOutput {
  let produced = 0;
  let completedBy: ProductionBatchSnapshot | null = null;
  for (const batch of active) {
    produced += batch.quantity;
    if (completedBy === null && produced >= quantity) {
      completedBy = batch;
    }
  }
  return {
    produced,
    remaining: Math.max(0, quantity - produced),
    surplus: Math.max(0, produced - quantity),
    complete: produced >= quantity,
    completedBy,
  };
}

/**
 * La fournée telle qu'elle COMPTE : sa quantité moins ce que le colisage a
 * rendu (K2, §13 B2) et moins sa part corrigée (
 * `fournil/les-niveaux-de-suivi.md`). « Sorti » ne baisse que par une
 * réponse du colisage — jamais par la demande — donc une fournée en « retour
 * en attente » compte entière. Une fournée entièrement corrigée compte zéro,
 * et reste une fournée : elle n'est pas annulée.
 */
export function countedBatch(batch: ProductionBatchSnapshot): ProductionBatchSnapshot {
  const deducted = batch.returned + batch.corrected;
  return deducted === 0 ? batch : { ...batch, quantity: batch.quantity - deducted };
}
