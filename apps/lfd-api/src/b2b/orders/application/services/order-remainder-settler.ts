import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OrderHandedOverEvent } from "../../domain/events/order-handed-over.event.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { PendingRemaindersReader } from "../../domain/ports/pending-remainders.reader.js";
import {
  RemainderSettlement,
  type RemainderHandoverAct,
} from "../../domain/ports/remainder-settlement.js";
import { SettledOrderWriter } from "../../domain/ports/settled-order.writer.js";
import { settlesOnRemainder } from "../../domain/services/shipment-settlement.js";

/**
 * **Le dernier reste remis solde la commande** — l'implémentation de
 * {@link RemainderSettlement} (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 8, lot L5b).
 *
 * Dans l'unité de travail de l'appelant, qui tient le verrou de la commande
 * et vient de remettre le BL du reste : la commande en partie retirée passe
 * `fulfilled`, et `order.fulfilled` part — une fois par commande, sa clé ne
 * porte pas de rang (choix 6). Le fait porte l'instant et l'auteur de CE
 * retrait, le dernier : c'est lui qui solde.
 */
@Injectable()
export class OrderRemainderSettler extends RemainderSettlement {
  constructor(
    private readonly orders: OrderReader,
    private readonly remainders: PendingRemaindersReader,
    private readonly writer: SettledOrderWriter,
    private readonly durable: DurablePublisher,
  ) {
    super();
  }

  async settleIfComplete(act: RemainderHandoverAct): Promise<boolean> {
    const order = await this.orders.findById(act.orderId);
    if (order === null) {
      return false;
    }
    const pending = await this.remainders.anyPending(act.orderId);
    if (!settlesOnRemainder(order.view.status, pending)) {
      return false;
    }
    if (!(await this.writer.settle(act.orderId))) {
      return false;
    }
    const settled = new OrderHandedOverEvent(
      act.orderId,
      order.view.orderNumber,
      order.placedByUserId,
      act.handedOverBy,
      act.handedOverAt,
      act.via,
    );
    await this.durable.publish(settled.durableFact());
    return true;
  }
}
