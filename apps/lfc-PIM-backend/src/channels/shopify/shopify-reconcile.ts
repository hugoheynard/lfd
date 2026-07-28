/**
 * Rapprochement **pur** entre les collections de TVA voulues et celles réellement
 * présentes sur la boutique. Aucun appel réseau, aucune dépendance Nest — c'est la
 * pièce qui a de la valeur ; le transport (quel appel Admin, quelle version d'API)
 * changera, mais ce que *signifie* « réconcilier » ne changera pas.
 *
 * Le backend reste **agnostique de la TVA** : il ne connaît pas les régimes, seulement
 * une liste de collections désirées (handle + titre) que le front lui transmet. Une
 * collection `tva-*` présente sur la boutique que plus rien ne réclame est une
 * **orpheline**.
 */

/** Une collection Shopify, réduite à ce dont la réconciliation a besoin. */
export interface ShopifyCollection {
  readonly id: string;
  /** Handle = clé de rapprochement (`tva-5-5`). */
  readonly handle: string;
  readonly title: string;
  /** Fiches rattachées côté boutique — `0` = collection poussée vide. */
  readonly productCount: number;
}

/** Ce que le front veut voir exister sur la boutique. */
export interface DesiredCollection {
  /** Handle attendu — le tag du régime (`tva-5-5`). */
  readonly handle: string;
  readonly title: string;
}

/** Une collection désirée rapprochée de son éventuelle contrepartie distante. */
export interface ReconcileRow {
  readonly handle: string;
  readonly title: string;
  readonly present: boolean;
  /** La collection distante rapprochée, si elle existe. */
  readonly remote: ShopifyCollection | null;
}

export interface Reconciliation {
  readonly rows: readonly ReconcileRow[];
  /** Collections `tva-*` sur la boutique que plus aucune désirée ne réclame. */
  readonly orphans: readonly ShopifyCollection[];
  readonly missingCount: number;
}

/** Préfixe qui marque une collection comme « gérée par la TVA ». */
export const TVA_HANDLE_PREFIX = 'tva-';

export function reconcileCollections(
  desired: readonly DesiredCollection[],
  live: readonly ShopifyCollection[],
): Reconciliation {
  const byHandle = new Map(
    live.map((collection) => [collection.handle, collection]),
  );
  const wanted = new Set<string>();

  const rows: ReconcileRow[] = desired.map((target) => {
    wanted.add(target.handle);
    const remote = byHandle.get(target.handle) ?? null;
    return {
      handle: target.handle,
      title: target.title,
      present: remote !== null,
      remote,
    };
  });

  const orphans = live.filter(
    (collection) =>
      collection.handle.startsWith(TVA_HANDLE_PREFIX) &&
      !wanted.has(collection.handle),
  );
  const missingCount = rows.filter((row) => !row.present).length;

  return { rows, orphans, missingCount };
}

/** Les désirées qui manquent encore — l'entrée exacte du push. */
export function missingCollections(
  reconciliation: Reconciliation,
): DesiredCollection[] {
  return reconciliation.rows
    .filter((row) => !row.present)
    .map((row) => ({ handle: row.handle, title: row.title }));
}
