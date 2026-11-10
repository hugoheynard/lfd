import type { OrderCardSettled } from "../services/order-card-settled.js";

/**
 * Ce que le bloc `card-payment` demande d'une commande payée par carte (plan
 * M2, §3.3, §4.4) : son intention, son total, et où en est son règlement.
 */
export interface OrderCardStanding {
  readonly orderId: string;
  readonly orderNumber: string;
  /** `orders.stripe_payment_intent_id` — `null` : rien à encaisser par carte. */
  readonly providerRef: string | null;
  /**
   * Le montant du PREMIER paiement : le total moins les compléments des
   * hausses appliquées (plan S2, §2.5) — le total seul serait faux après une
   * hausse, et l'adoption ou le rattrapage rendraient 52 € pour une intention
   * de 40 €.
   */
  readonly firstPaymentCents: number;
  readonly cancelled: boolean;
  readonly settled: OrderCardSettled;
}

/**
 * **Lire une commande pour le canal des cartes** (plan M2, §4.4, §4.6) — un
 * seul consommateur, l'implémentation `order` du canal retour et les gestes
 * du commerce qui adoptent une intention d'avant le bloc. Lecture seule.
 */
export abstract class OrderCardStandingReader {
  abstract ofOrder(orderId: string): Promise<OrderCardStanding | null>;

  /** La commande qui porte cette intention (`@unique`), ou `null`. */
  abstract ofIntent(providerRef: string): Promise<OrderCardStanding | null>;

  /** Les commandes créées depuis `since` qui portent une intention — une borne connue (§4.3). */
  abstract withIntentCreatedSince(since: Date): Promise<readonly OrderCardStanding[]>;
}
