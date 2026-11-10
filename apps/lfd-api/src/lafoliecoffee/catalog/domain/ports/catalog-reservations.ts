/** Une réservation d'article à une société, telle qu'on l'écrit. */
export interface CatalogReservation {
  readonly sku: string;
  readonly companyId: string;
  readonly reservedAt: Date;
  /** L'id de la fiche staff qui réserve. */
  readonly reservedBy: string;
}

/**
 * Port d'**écriture** des réservations (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, § 4, lot L1a).
 *
 * Une ligne par couple article × société ; aucun invariant entre lignes que
 * la clé primaire ne tienne déjà. Retirer supprime la ligne : une réservation
 * n'est pas un agrégat métier, et le journal garde le geste.
 */
export abstract class CatalogReservations {
  /** @returns faux si l'article était déjà réservé à cette société — rien n'est écrit. */
  abstract reserve(reservation: CatalogReservation): Promise<boolean>;

  /** @returns faux si l'article n'était pas réservé à cette société. */
  abstract release(sku: string, companyId: string): Promise<boolean>;
}
