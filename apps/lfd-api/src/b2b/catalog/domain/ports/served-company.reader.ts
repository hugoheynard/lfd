import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";
import type { ReservationHolders } from "../../../shared/company-standing/domain/reservation-holders.js";

/** Ce que la fabrique du lecteur lit d'une société, en UNE lecture. */
export interface ServedCompany {
  /** Le statut de la société, relu à chaque requête — jamais pris d'un jeton. */
  readonly status: StandingCompanyStatus;
  readonly holders: ReservationHolders;
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
