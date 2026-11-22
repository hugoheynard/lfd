import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";
import type { ReservationHolders } from "../../../shared/company-standing/domain/reservation-holders.js";
import type { MenuReading } from "../../../shared/company-standing/domain/sub-account-menu-reading.js";

/** Ce que la fabrique du lecteur lit d'une société, en UNE lecture. */
export interface ServedCompany {
  /** Le statut de la société, relu à chaque requête — jamais pris d'un jeton. */
  readonly status: StandingCompanyStatus;
  /** Posé quand le compte est supprimé : la société est alors fermée, quel que soit son statut. */
  readonly archivedAt: Date | null;
  readonly holders: ReservationHolders;
  /**
   * Le principal actuel, actif ou non — `holders` ne le nomme que s'il est
   * `active`. Ne sert qu'à ranger le rayon pro avec son principal, pour
   * qu'une purge du principal efface ses sites ; jamais à ouvrir un article.
   */
  readonly principalId: string | null;
  /** La carte qui compte pour cette société (`carte-des-sites.md`, § 3.1), lue avec le reste. */
  readonly menu: MenuReading | null;
}

/**
 * Port de **lecture** de la fabrique `CatalogViewers` : le statut d'une
 * société et pour qui ses articles réservés s'ouvrent, lus ensemble (plan
 * `plan-pros-en-cours-d-inscription.md`, lot P0). Une méthode (ISP) ;
 * l'adaptateur lit la requête partagée `readServedCompany`.
 */
export abstract class ServedCompanyReader {
  /** @returns `null` si la société est inconnue. */
  abstract servedOf(companyId: string): Promise<ServedCompany | null>;
}
