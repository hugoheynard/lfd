/**
 * **L'historique d'un article, lignée comprise** (`plan-pro-voit-les-declinaisons.md`,
 * L7d-bis) — le calcul pur.
 *
 * Une ligne passée sous une ancienne référence compte pour chaque SKU évalué
 * qui en descend. Lecture seule : aucune commande n'est réécrite.
 */

/**
 * Pour chaque référence à lire, les SKU évalués à qui elle compte : le SKU
 * lui-même, et ceux dont elle est un ancêtre.
 */
export function evaluatedSkusByReadSku(
  skus: readonly string[],
  ancestors: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
  const owners = new Map<string, string[]>();
  for (const sku of skus) {
    for (const read of [sku, ...(ancestors.get(sku) ?? [])]) {
      const current = owners.get(read) ?? [];
      if (!current.includes(sku)) {
        current.push(sku);
      }
      owners.set(read, current);
    }
  }
  return owners;
}
