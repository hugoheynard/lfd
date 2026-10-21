import type {
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
  ProductionResupplySnapshot,
} from "../entities/production-day.snapshot.js";

/**
 * **Ce qui part au colisage, et ce qui monte directement** (réassort, R3c,
 * décision 3 de Hugo du 2026-10-21 — `reassort-boutiques/plan-reapprovisionnement.md`
 * §13.4, « Après R3b »).
 *
 * Les fournées se cochent sur le TOTAL (commandes + réassorts, décision B) ;
 * mais un réassort d'un point servi SUR PLACE (le Labo) va de la feuille à la
 * vitrine, sans fiche au colisage. Remettre ses pièces au colisage les y
 * laisserait libres, sans personne pour les emballer. Une fournée se coupe
 * donc en deux : la part remise, et la part gardée pour le point sur place.
 *
 * L'ordre, choisi par le bâtisseur faute d'écrit : le COLISAGE D'ABORD (ses
 * commandes ont une échéance et un client), puis la part sur place, puis le
 * surplus au-delà du compte, remis au colisage comme avant le lot. Sans
 * réassort sur place, la fournée entière est remise — rien ne change.
 *
 * Calculé sur les fournées VIVANTES et ce que le registre dit de chacune
 * (`handed`) : une fournée annulée sort du calcul avec sa part, et un retour
 * du colisage n'en change pas la part gardée.
 */

/** Une fournée déjà déclarée du même article, et ce qui en a été remis. */
export interface EarlierBatchShare {
  readonly quantity: number;
  /** Ce que sa remise a porté ; `0` : rien remis (gardée entière). */
  readonly handed: number;
  /** Ce que le colisage en a rendu. */
  readonly returned: number;
}

/** La part d'un article servie sur place : Σ des réassorts non servis par transfert. */
export function onSiteShareOf(
  resupplies: readonly ProductionResupplySnapshot[],
  sku: string,
): number {
  return resupplies
    .filter((resupply) => !resupply.servedByTransfer)
    .flatMap((resupply) => resupply.lines)
    .filter((line) => line.sku === sku)
    .reduce((total, line) => total + line.quantity, 0);
}

/**
 * Combien de pièces de cette fournée partent au colisage (0 ≤ rendu ≤ quantité).
 */
export function handedQuantityOf(input: {
  /** La ligne du compte : commandes + tous les réassorts. */
  readonly counted: number;
  /** Ce qui, dans ce compte, est servi sur place. */
  readonly onSite: number;
  readonly earlier: readonly EarlierBatchShare[];
  readonly quantity: number;
}): number {
  const kept = input.earlier.reduce((total, batch) => total + batch.quantity - batch.handed, 0);
  const handed = input.earlier.reduce((total, batch) => total + batch.handed - batch.returned, 0);
  const packingNeed = Math.max(0, input.counted - input.onSite);
  const toPacking = Math.min(input.quantity, Math.max(0, packingNeed - handed));
  const keep = Math.min(input.quantity - toPacking, Math.max(0, input.onSite - kept));
  return input.quantity - keep;
}

/**
 * La part remise de `batch`, d'après la journée : son compte, ses réassorts,
 * ses autres fournées vivantes de l'article et ce que le registre en a reçu.
 */
export function handedShareOf(
  day: {
    readonly counts: readonly ProducedItemSnapshot[];
    readonly resupplies: readonly ProductionResupplySnapshot[];
    readonly batches: readonly ProductionBatchSnapshot[];
  },
  batch: ProductionBatchSnapshot,
  handedByBatch: ReadonlyMap<string, number>,
): number {
  const onSite = onSiteShareOf(day.resupplies, batch.sku);
  if (onSite === 0) {
    return batch.quantity;
  }
  const earlier = day.batches
    .filter((other) => other.sku === batch.sku && other.id !== batch.id && other.cancelled === null)
    .map((other) => ({
      quantity: other.quantity,
      handed: handedByBatch.get(other.id) ?? 0,
      returned: other.returned,
    }));
  return handedQuantityOf({
    counted: day.counts.find((item) => item.sku === batch.sku)?.quantity ?? 0,
    onSite,
    earlier,
    quantity: batch.quantity,
  });
}
