import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_BILLING_SETTLED,
  OrderBillingSettledFact,
} from "../../domain/events/order-billing-settled.fact.js";
import { ShortfallRefunding } from "../services/shortfall-refunding.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFUND_SHORTFALL_ON_BILLING_SETTLED = "orders.refund-shortfall.on-billing-settled";

/**
 * **Le solde est posé ou corrigé : le reste d'un départ incomplet payé par
 * carte se rembourse** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.1, § 4.2).
 * Après la validation de la remise : un refus ne bloque jamais le comptoir.
 *
 * Dans la transaction du reçu ({@link ShortfallRefunding}) : le verrou
 * `orders`, le facturable RELU (le relais peut livrer un `closed` après le
 * `corrected` qui le suit — le payload ne sert qu'à nommer la commande), puis
 * l'argent. Une cause de blocage s'écrit au journal
 * (`order.shortfall_refund_blocked`, acteur `system`) et l'abonné rend
 * normalement : le reçu, le journal et l'adoption sont validés ensemble, la
 * fiche commande montre « Rembourser le reste ». Un refus en phase 2 lève :
 * tout est annulé, la boîte d'envoi relance (au plus 10 fois, puis lettre
 * morte, visible à son écran seulement).
 *
 * Rejoué ou réveillé deux fois, il ne demande rien de plus : la demande déjà
 * ouverte est retranchée du reste, relu sous le verrou.
 */
@Injectable()
@DurableHandler({ type: ORDER_BILLING_SETTLED, subscriber: REFUND_SHORTFALL_ON_BILLING_SETTLED })
export class RefundShortfallOnBillingSettled implements DurableSubscriber {
  constructor(private readonly refunding: ShortfallRefunding) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const orderId = OrderBillingSettledFact.orderIdOf(delivery.payload);
    const judged = await this.refunding.judgeLocked(orderId);
    if (judged === null) {
      return;
    }
    const { subject, verdict } = judged;
    if (verdict.kind === "blocked") {
      await this.refunding.note(subject, verdict);
    } else if (verdict.kind === "refund") {
      await this.refunding.request(verdict, null);
    }
  }
}
