import type { OrderStatus } from "@lfd/contracts";

import type { ClockWindow } from "../services/transfer-departure.js";

/** Un retrait du jour réduit à ce qui fixe l'arrivée de son site. */
export interface SiteArrivalOrder {
  /** Figé à la passation (S2) ; `null` = commande d'avant le lot. */
  readonly siteId: string | null;
  /** La fenêtre convenue, `HH:mm` ; `null` = aucune. */
  readonly window: ClockWindow | null;
}

/**
 * 🔴 **Les statuts d'un retrait encore à servir** : il n'est ni annulé, ni
 * remis (`fulfilled`), ni en brouillon. Ce n'est PAS le statut du plan
 * (`STATUS_IN_PLAN`, `placed` seul) : l'arrêt du plan confirme les commandes,
 * et une échéance de site lue au plan s'éteint précisément au moment où la
 * livraison compose ses tournées (défaut constaté le 2026-10-24).
 *
 * `in_production` n'est écrit par aucun chemin (vérifié le 2026-10-24) ; il
 * est compté pour qu'une commande qui le porterait un jour ne fasse pas
 * disparaître l'heure de son site.
 *
 * Le compte à rebours du fournil (`DeadlineOrdersReader`) lit la même liste,
 * livraisons comprises : aucune n'a de statut propre entre `confirmed` et
 * `fulfilled` (vérifié le 2026-10-24).
 */
export const STATUSES_AWAITING_PICKUP: readonly OrderStatus[] = [
  "placed",
  "confirmed",
  "in_production",
  "ready",
];

/**
 * **Les retraits d'une journée encore vivants**, avant comme après l'arrêt du
 * plan — ce dont le transfert d'un site tire son heure d'arrivée requise
 * (`CommerceTransferSites`).
 *
 * Un port à lui (ISP), et pas `DayOrdersSource` : celui-ci sert la clôture,
 * dont le périmètre est le plan (`placed`) et doit le rester. Même règle
 * d'argent (`settlementWhere`) : un règlement mort ou en vol n'appelle pas le
 * camion.
 */
export abstract class SiteArrivalOrdersReader {
  /** `day` : `AAAA-MM-JJ`. */
  abstract forDay(day: string): Promise<readonly SiteArrivalOrder[]>;
}
