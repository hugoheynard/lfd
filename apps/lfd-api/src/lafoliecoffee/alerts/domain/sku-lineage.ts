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

/**
 * **La norme catalogue d'un article, lignée comprise** (§ « La norme catalogue
 * suit la lignée », 2026-10-30).
 *
 * La projection `product_norms` reste par SKU ; c'est sa LECTURE qui remonte :
 * parmi le SKU et ses ancêtres, la norme la mieux échantillonnée l'emporte, à
 * égalité la plus proche. Une référence née d'un détachement hérite ainsi de
 * la norme de l'ancienne dès sa première commande, puis prend la main quand
 * ses propres lignes dépassent celles de l'ancienne — qui, archivée, sort de la
 * fenêtre de calcul. Le plancher (`minSampleLines`) reste au détecteur.
 */
export function lineageNorms<N extends { readonly sampleLines: number }>(
  skus: readonly string[],
  ancestors: ReadonlyMap<string, readonly string[]>,
  norms: ReadonlyMap<string, N>,
): ReadonlyMap<string, N> {
  const resolved = new Map<string, N>();
  for (const sku of skus) {
    let best: N | undefined;
    for (const read of [sku, ...(ancestors.get(sku) ?? [])]) {
      const norm = norms.get(read);
      if (norm !== undefined && (best === undefined || norm.sampleLines > best.sampleLines)) {
        best = norm;
      }
    }
    if (best !== undefined) {
      resolved.set(sku, best);
    }
  }
  return resolved;
}

/** Toutes les références à lire pour ces SKU : eux, puis leurs ancêtres. */
export function lineageReadSkus(
  skus: readonly string[],
  ancestors: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  return [...evaluatedSkusByReadSku(skus, ancestors).keys()];
}
