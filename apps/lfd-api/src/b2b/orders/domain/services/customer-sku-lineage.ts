import type { CustomerSkuTally } from "../ports/customer-sku.reader.js";

/**
 * **La reprise d'abord, la récence ensuite.** Ce que le commercial cherche est
 * l'habitude : un produit pris sur douze commandes passe devant celui pris une
 * fois la semaine dernière. Le chiffre d'affaires ne départage pas — il ferait
 * remonter les articles chers, pas les articles habituels.
 */
export function byReuseThenRecency(left: CustomerSkuTally, right: CustomerSkuTally): number {
  const reuse = right.orderCount - left.orderCount;
  return reuse === 0 ? right.lastOrderedAt.getTime() - left.lastOrderedAt.getTime() : reuse;
}

/**
 * **Les habitudes d'une déclinaison détachée, sous une seule ligne**
 * (`plan-pro-voit-les-declinaisons.md`, L7d-bis) : chaque compte passe sous la
 * référence la plus récente de sa lignée (`latest`, absente = elle-même), et
 * les comptes d'une même ligne s'additionnent. Lecture seule : aucune
 * commande n'est réécrite.
 *
 * L'addition des commandes distinctes est exacte : l'origine archive la
 * déclinaison dans le geste même du détachement, et la fiche née naît
 * inactive — aucune commande ne porte les deux références
 * (`detach-product-variant.ts`, lu le 2026-10-30).
 */
export function regroupByLineage(
  tallies: readonly CustomerSkuTally[],
  latest: ReadonlyMap<string, string>,
): readonly CustomerSkuTally[] {
  const bySku = new Map<string, CustomerSkuTally>();
  for (const tally of tallies) {
    const sku = latest.get(tally.sku) ?? tally.sku;
    const current = bySku.get(sku);
    bySku.set(sku, current === undefined ? { ...tally, sku } : merged(current, tally));
  }
  return [...bySku.values()].sort(byReuseThenRecency);
}

/** Les deux comptes réunis ; le nom de repli suit la commande la plus récente. */
function merged(kept: CustomerSkuTally, other: CustomerSkuTally): CustomerSkuTally {
  const recent = other.lastOrderedAt > kept.lastOrderedAt ? other : kept;
  return {
    sku: kept.sku,
    lastProductName: recent.lastProductName,
    orderCount: kept.orderCount + other.orderCount,
    totalQuantity: kept.totalQuantity + other.totalQuantity,
    totalCents: kept.totalCents + other.totalCents,
    lastOrderedAt: recent.lastOrderedAt,
  };
}
