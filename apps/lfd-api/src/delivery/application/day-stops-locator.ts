/**
 * **Situer les arrêts d'un jour, plus tard** (lot CA0) — ce dont les abonnés
 * de l'arrêt du plan et du retirage ont besoin, et rien d'autre (ISP) : ils
 * tournent dans une transaction, le géocodage part après la validation.
 * Implémenté par `DeliveryStopsLocating`.
 */
export abstract class DayStopsLocator {
  abstract locateDaySoon(day: string): void;
}
