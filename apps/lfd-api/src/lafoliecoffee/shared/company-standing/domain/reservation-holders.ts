/**
 * **Pour qui un article réservé s'ouvre**, vu d'une société servie
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, S1, § 5) : la
 * société elle-même, et son principal tant qu'il est `active` (Q8).
 *
 * 🔴 Fabriqué par la requête partagée (`readReservationHolders`) et par les
 * doublures de test, jamais recomposé par un appelant : un principal inventé
 * ouvrirait à un site les articles réservés à un autre compte. Le type ne peut
 * pas l'interdire seul ; la règle est écrite ici pour qu'une relecture le voie.
 */
export interface ReservationHolders {
  readonly companyId: string;
  /** Le principal de la société, seulement s'il est `active` ; `null` sinon. */
  readonly activePrincipalId: string | null;
}

/** Les sociétés dont une réservation ouvre l'article : `[C]` ou `[C, parent(C)]`. */
export function holderIds(holders: ReservationHolders): readonly string[] {
  return holders.activePrincipalId === null
    ? [holders.companyId]
    : [holders.companyId, holders.activePrincipalId];
}
