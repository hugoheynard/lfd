/**
 * **Préparer un jour, plus tard** : situer ses arrêts (lot CA0), puis
 * composer ses tournées (2026-10-07, `DayAutoComposition`) — ce dont les abonnés
 * de l'arrêt du plan et du retirage ont besoin, et rien d'autre (ISP) : ils
 * tournent dans une transaction, le géocodage part après la validation.
 * Implémenté par `DeliveryStopsLocating` ; l'abonné à la commande passée
 * (`LocateOnOrderPlaced`) s'en sert aussi.
 */
export abstract class DayStopsLocator {
  /** L'arrêt du plan : situer, puis composer les tournées du jour. */
  abstract prepareDaySoon(day: string): void;
  /**
   * Le retirage : situer seulement. Ses commandes tardives passent par la
   * cloche et la place suggérée (CA7) — le bureau voit où elles vont.
   */
  abstract locateDaySoon(day: string): void;
  /** Une commande passée (CA0) : situer le jour de sa livraison, si c'en est une. */
  abstract locateOrderSoon(orderId: string): void;
}
