import type { ReservationHolders } from "../../../shared/company-standing/domain/reservation-holders.js";

/**
 * Port de **lecture** : pour qui un article réservé s'ouvre, vu d'une société
 * (`plan-articles-sur-mesure.md`, § 5). Une méthode (ISP) ; l'adaptateur lit la
 * requête partagée `readReservationHolders`.
 */
export abstract class ReservationHoldersReader {
  abstract holdersOf(companyId: string): Promise<ReservationHolders>;
}
