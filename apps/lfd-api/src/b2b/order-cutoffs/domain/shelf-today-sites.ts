import type { SameDayDoor } from "./same-day-doors.js";

/** La question que la boutique pose pour aujourd'hui, plan du jour arrêté. */
export interface ShelfTodayQuestion {
  /** Aujourd'hui, `AAAA-MM-JJ`, à l'horloge du serveur. */
  readonly day: string;
  /**
   * La porte du circuit de l'appelant — décidée au serveur (la société d'un
   * client reconnu, `sameDayDoorOf`), l'audience annoncée pour un anonyme.
   */
  readonly door: SameDayDoor;
  /** Les points de retrait à juger. */
  readonly siteIds: readonly string[];
  /** Les SKU du panier ; vide = aucun panier. */
  readonly cartSkus: readonly string[];
}

/**
 * **Les points qui vendent encore aujourd'hui sur leur vitrine** (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §3, §14
 * lot L4) — lu par `GET /fulfillment-days` quand le plan d'aujourd'hui est
 * arrêté et que la clientèle y a droit.
 *
 * Déclaré par les heures limites, qui proposent la journée ; implémenté par
 * les commandes (`OrderShelfTodaySites`), qui portent la règle des créneaux
 * restants et lisent le reste de la vitrine. Il OUVRE un écran, il
 * n'autorise rien : la passation reste l'autorité, sous le verrou du stock.
 */
export abstract class ShelfTodaySites {
  /**
   * Les points qui ont encore un créneau pour cette porte après
   * maintenant, et du stock pour TOUT le panier (un panier mixte se voit
   * proposer demain, §3) — ou, sans panier, du stock tout court : sans
   * réassort reçu, aujourd'hui n'est pas proposé.
   */
  abstract sellingToday(question: ShelfTodayQuestion): Promise<ReadonlySet<string>>;
}
