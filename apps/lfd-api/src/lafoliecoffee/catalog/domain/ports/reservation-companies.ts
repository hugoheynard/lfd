/**
 * Le nom d'affichage d'une société à qui l'on réserve un article — ce que le
 * journal fige, et la preuve qu'elle existe. Port à une méthode (ISP) : le
 * handler de réservation n'a besoin de rien d'autre.
 */
export abstract class ReservationCompanies {
  /** `null` : l'identifiant ne désigne aucune société. */
  abstract nameOf(companyId: string): Promise<string | null>;
}
