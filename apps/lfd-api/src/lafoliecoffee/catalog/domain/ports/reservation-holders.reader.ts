import type { HoldersWithMenu } from "../../../shared/company-standing/domain/sub-account-menu-reading.js";

/**
 * Port de **lecture** : pour qui un article réservé s'ouvre, vu d'une société
 * (`plan-articles-sur-mesure.md`, § 5). Une méthode (ISP) ; l'adaptateur lit la
 * requête partagée `readReservationHolders` — la carte du sous-compte comprise,
 * lue dans la même requête (`carte-des-sites.md`, § 4).
 */
export abstract class ReservationHoldersReader {
  abstract holdersOf(companyId: string): Promise<HoldersWithMenu>;
}
