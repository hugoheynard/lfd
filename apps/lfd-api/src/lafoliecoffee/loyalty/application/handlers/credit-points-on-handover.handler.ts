import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_FULFILLED,
  OrderHandedOverEvent,
} from "../../../orders/domain/events/order-handed-over.event.js";
import { CreditOrderPointsCommand } from "../commands/credit-order-points.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const CREDIT_POINTS_ON_HANDOVER = "b2b.loyalty.credit-on-handover";

/**
 * La commande vient d'être **remise** : si elle était déjà réglée, elle est
 * définitive et rapporte ses points (plan D3). Sinon, rien — le règlement,
 * quand il viendra, tentera à son tour.
 *
 * Il écoute le fait du COMMERCE (`order.fulfilled`), pas celui du retrait :
 * c'est le commerce qui a écrit `fulfilled`.
 *
 * ## Abonné DURABLE depuis le 2026-10-04 (lot E2)
 *
 * En mémoire, un container qui tombait après `fulfilled` faisait perdre les
 * points, et seul le rattrapage les retrouvait. Livré au moins une fois
 * désormais, et appliqué une fois : le crédit relit les gains de la commande
 * sous le verrou du titulaire, et l'index unique
 * `loyalty_ledger_entries_earned_order_key` refuse en base un second gain
 * (vérifié le 2026-10-04) — refus qui fait échouer la livraison, reprise
 * ensuite sans effet.
 */
@Injectable()
@DurableHandler({ type: ORDER_FULFILLED, subscriber: CREDIT_POINTS_ON_HANDOVER })
export class CreditPointsOnHandover implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    await this.commands.execute<CreditOrderPointsCommand, boolean>(
      new CreditOrderPointsCommand(event.orderId),
    );
  }
}
