import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  PACKING_ORDER_PACKED,
  PackingOrderPackedEvent,
} from "../../../../production/channels/commerce/index.js";
import { MarkOrderReadyCommand } from "../commands/mark-order-ready.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_ORDER_PACKED = "b2b.orders.mark-ready-from-packing";

/**
 * **Le commerce apprend qu'un bac est fait — au colisage** (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §11, §12.1, K2).
 *
 * Le seul abonné « bac fait » depuis K3c (§17.3) : `OnOrderPacked`, qui
 * écoutait `production.order_packed` de l'ancien poste du fournil, est retiré
 * avec lui. `MarkOrderReadyCommand` ne fait rien sur une commande déjà prête :
 * une réannonce est sans effet.
 */
@Injectable()
@DurableHandler({ type: PACKING_ORDER_PACKED, subscriber: ON_PACKING_ORDER_PACKED })
export class OnPackingOrderPacked implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingOrderPackedEvent.fromPayload(delivery.payload);
    // L'identité et l'instant viennent du FAIT : la fermeture a eu lieu au colisage.
    await this.commands.execute(
      new MarkOrderReadyCommand(event.reference, event.packedBy, event.packedAt),
    );
  }
}
