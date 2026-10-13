import type { GpsPoint } from "@lfd/contracts";

/**
 * **Combien de minutes de route entre deux points** (plan des sites, §4.6,
 * Q-T11 tranchée le 2026-10-13 : le trajet d'un transfert interne est calculé
 * depuis les coordonnées, jamais saisi).
 *
 * La livraison DÉCLARE et IMPLÉMENTE ce port, le commerce le lit — comme
 * `DepartureSiteReader`. Le calcul routier (OSRM, `DistanceMatrix`) reste
 * privé au bloc : le commerce ne reçoit qu'une durée.
 *
 * `null` = la route ne se calcule pas (calcul routier non branché ou
 * injoignable) : l'appelant le traite comme une heure inconnue, jamais comme
 * zéro ni comme un vol d'oiseau.
 */
export abstract class RoadTravelTimeReader {
  abstract minutesBetween(from: GpsPoint, to: GpsPoint): Promise<number | null>;
}
