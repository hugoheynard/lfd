import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
} from "../../../../handover/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { FIRST_SHIPMENT_RANK } from "../../../../production/channels/commerce/index.js";
import { HandOverRemainderNoteCommand } from "../commands/hand-over-remainder-note.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_REMAINDER_HANDED_OVER = "b2b.delivery-notes.hand-over-remainder";

/**
 * **Un reliquat est remis au client** (plan E7 reliquat, choix 3, lot L4b).
 *
 * Même figure que `OnRemainderPacked` : un second abonné à
 * `handover.handed_over` plutôt qu'une branche dans `OnOrderHandedOver`. Le
 * rang 1 ferme la COMMANDE (et son BL suit) ; un rang > 1 ne remet que SON
 * BL. Chacun ignore l'autre moitié des faits sans trace, puisqu'elle a son
 * lecteur.
 */
@Injectable()
@DurableHandler({ type: HANDOVER_HANDED_OVER, subscriber: ON_REMAINDER_HANDED_OVER })
export class OnRemainderHandedOver implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    if (event.rank === FIRST_SHIPMENT_RANK) {
      return;
    }
    await this.commands.execute(
      new HandOverRemainderNoteCommand(
        event.orderId,
        event.rank,
        event.handedOverAt,
        event.handedOverBy,
        event.via,
      ),
    );
  }
}
