import { z } from "zod";

/**
 * ── Les commandes notées au comptoir, à régler en boutique ─────────────────
 *
 * `documentation/commandes/passation/commande-particulier-reglee-en-boutique.md`,
 * § 4.2 : un suivi **à part** du chiffre d'affaires web, qui ne les compte
 * pas. `GET /admin/growth/shop-till-orders?from=&to=` → `ShopTillOrdersReportView`,
 * sous `b2b_growth:read`, comme les autres rapports de la croissance.
 *
 * Ce sont des montants **commandés**, jamais encaissés : notre système ne
 * sait pas qu'une telle commande est payée — la caisse de la boutique
 * l'encaisse. Montants TTC en centimes. Aucun total de ce rapport ne
 * s'additionne au CA web.
 */

/** La plus longue période du rapport, en jours. */
export const SHOP_TILL_ORDERS_MAX_PERIOD_DAYS = 366;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

/** Du jour de retrait `from` au jour `to`, compris. */
export const shopTillOrdersReportQuerySchema = z.strictObject({
  from: isoDay,
  to: isoDay,
});
export type ShopTillOrdersReportQuery = z.infer<typeof shopTillOrdersReportQuerySchema>;

/** Un point de retrait et un jour de retrait. */
export interface ShopTillOrdersDay {
  /** Le jour de retrait demandé, `AAAA-MM-JJ`. */
  readonly day: string;
  /** Le site figé dans le point de retrait, `null` s'il n'en porte pas. */
  readonly siteId: string | null;
  /** Le nom du point de retrait figé à la commande, `null` s'il est illisible. */
  readonly pickupLabel: string | null;
  /** Commandes passées (ni brouillon ni annulée), non retirées comprises : leur TTC commandé. */
  readonly orderedTtcCents: number;
  readonly orderedCount: number;
  /** Parmi elles, celles qui ont été remises : leur TTC commandé. */
  readonly handedOverTtcCents: number;
  readonly handedOverCount: number;
  /**
   * Parmi elles, celles que le client n'est pas venu retirer (`no_show`) :
   * leur TTC commandé — un montant perdu, jamais encaissé ni réclamé.
   */
  readonly notCollectedTtcCents: number;
  readonly notCollectedCount: number;
}

export interface ShopTillOrdersReportView {
  readonly from: string;
  readonly to: string;
  /** Par jour, puis par point de retrait. */
  readonly rows: readonly ShopTillOrdersDay[];
}
