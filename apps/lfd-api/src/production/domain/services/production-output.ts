import type {
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
} from "../entities/production-day.snapshot.js";

/**
 * **Ce que le four a sorti d'un article** — des dérivés, jamais une colonne.
 *
 * Plan `documentation/production/plan-fournees-progressives.md`, D2 : l'état
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
  /** `produced ≥ quantity`. Remplace le sens de l'ancienne coche. */
  readonly complete: boolean;
  /** La fournée qui a fait passer la ligne à complète, ou `null`. */
  readonly completedBy: ProductionBatchSnapshot | null;
}

/**
 * L'`id` de la fournée implicite d'une coche héritée — **le même** que celui du
 * rattrapage de la migration `20260928160000_les_fournees`. Les deux chemins qui
 * l'écrivent (le rattrapage, le binaire qui matérialise) ne peuvent donc pas se
 * doubler : le second tombe sur le `ON CONFLICT`.
 */
export function implicitBatchId(serviceDay: string, sku: string): string {
  return `backfill-${serviceDay}-${sku}`;
}

/**
 * **Les fournées implicites** : une par ligne cochée par l'ancien binaire et qui
 * n'a AUCUNE fournée réelle, annulée comprise (§5.2).
 *
 * « Aucune, annulée comprise » est la condition du rattrapage, et elle doit le
 * rester : une ligne que le nouveau binaire a déjà touchée est tenue par ses
 * fournées. Sans elle, décocher (qui annule tout) ferait renaître la coche
 * héritée, et la ligne resterait complète.
 */
export function implicitBatchesOf(
  serviceDay: string,
  counts: readonly ProducedItemSnapshot[],
  batches: readonly ProductionBatchSnapshot[],
): readonly ProductionBatchSnapshot[] {
  const touched = new Set(batches.map((batch) => batch.sku));
  return counts.flatMap((item) =>
    item.done === null || item.quantity <= 0 || touched.has(item.sku)
      ? []
      : [
          {
            id: implicitBatchId(serviceDay, item.sku),
            sku: item.sku,
            quantity: item.quantity,
            recorded: item.done,
            cancelled: null,
            returned: 0,
            pendingReturn: 0,
          },
        ],
  );
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
 * rendu (K2, §13 B2). « Sorti » ne baisse que par une réponse du colisage —
 * jamais par la demande — donc une fournée en « retour en attente » compte
 * entière.
 */
export function countedBatch(batch: ProductionBatchSnapshot): ProductionBatchSnapshot {
  return batch.returned === 0 ? batch : { ...batch, quantity: batch.quantity - batch.returned };
}
