import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  FIRST_SHIPMENT_RANK,
  PACKING_ORDER_PACKED,
  PackingOrderPackedEvent,
} from "../../../../production/channels/commerce/index.js";
import { PrepareRemainderNoteCommand } from "../commands/prepare-remainder-note.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_REMAINDER_PACKED = "b2b.delivery-notes.prepare-remainder";

/**
 * **Le bac d'un reliquat est fermé au colisage** (plan E7 reliquat, choix 4,
 * lot L4a).
 *
 * Un second abonné au même fait plutôt qu'une branche dans
 * `OnPackingOrderPacked` : le rang 1 rend la COMMANDE prête (commerce, et son
 * BL suit), un rang > 1 ne prépare que SON BL. Deux raisons de changer, deux
 * abonnés ; chacun ignore l'autre moitié des faits sans trace, puisqu'elle a
 * son lecteur.
 */
@Injectable()
@DurableHandler({ type: PACKING_ORDER_PACKED, subscriber: ON_REMAINDER_PACKED })
export class OnRemainderPacked implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingOrderPackedEvent.fromPayload(delivery.payload);
    if (event.rank === FIRST_SHIPMENT_RANK) {
      return;
    }
    await this.commands.execute(
      new PrepareRemainderNoteCommand(event.orderId, event.rank, event.packedAt),
    );
  }
}
