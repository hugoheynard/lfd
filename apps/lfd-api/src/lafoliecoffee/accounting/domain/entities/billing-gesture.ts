/**
 * Un geste staff sur un historique append-only (dates d'un mode, mode d'un
 * payeur) : l'instant, l'auteur, et l'identifiant du segment qu'il créerait.
 * L'instant et l'identifiant viennent des ports `Clock` et `IdGenerator` de
 * l'appelant : l'agrégat ne lit ni l'horloge ni l'aléa.
 */
export interface BillingGesture {
  readonly segmentId: string;
  readonly at: Date;
  readonly staffId: string;
}

/** Ce que tout segment append-only porte, quel que soit son contenu. */
export interface AppendOnlyStamp {
  readonly id: string;
  readonly effectiveFrom: Date;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
}

/** Le segment vivant qui prend effet à `at` ou après — celui qui bloque un nouveau changement. */
export function pendingOf<T extends AppendOnlyStamp>(entries: readonly T[], at: Date): T | null {
  return entries.find((entry) => entry.cancelledAt === null && entry.effectiveFrom >= at) ?? null;
}

/** Le segment vivant qui prend effet STRICTEMENT après `at` — le seul qu'on peut encore annuler. */
export function cancellableOf<T extends AppendOnlyStamp>(
  entries: readonly T[],
  at: Date,
): T | null {
  return entries.find((entry) => entry.cancelledAt === null && entry.effectiveFrom > at) ?? null;
}

/**
 * **Rien n'a bougé depuis `closure`** — la seconde condition de l'immédiat,
 * commune au mode et au moyen d'encaissement d'un payeur : aucun segment
 * vivant ne commence à elle ou après, ni n'a été écrit depuis — un seul
 * immédiat par période. Un segment annulé ne compte pas : une annulation
 * n'est admise qu'avant la prise d'effet (`cancellableOf`), il n'a donc
 * jamais valu.
 */
export function isQuietSince<T extends AppendOnlyStamp>(
  entries: readonly T[],
  closure: Date,
): boolean {
  return !entries.some(
    (entry) =>
      entry.cancelledAt === null &&
      (entry.createdAt.getTime() >= closure.getTime() ||
        entry.effectiveFrom.getTime() >= closure.getTime()),
  );
}
