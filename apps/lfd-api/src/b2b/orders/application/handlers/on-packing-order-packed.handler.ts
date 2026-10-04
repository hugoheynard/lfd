import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  OrderPackedEvent,
  PACKING_ORDER_PACKED,
} from "../../../../production/channels/commerce/index.js";
import { MarkOrderReadyCommand } from "../commands/mark-order-ready.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_ORDER_PACKED = "b2b.orders.mark-ready-from-packing";

/**
 * **Le commerce apprend qu'un bac est fait — au colisage** (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §11, §12.1, K2).
 *
 * Le pendant d'`OnOrderPacked` pour le fait `packing.order_packed`, que le
 * colisage publie sur une journée `packing`. Le commerce écoute LES DEUX types
 * pendant un déploiement : une journée arrêtée avant la bascule finit sur
 * l'ancien poste, et son fait garde l'ancien nom. L'abonné de l'ancien type se
 * retire en K3, quand plus aucune livraison ne le porte.
 *
 * Un abonné de plus plutôt qu'une branche dans l'ancien (OCP) : chacun garde
 * son reçu, et le retrait de l'un ne touche pas l'autre. Même charge, même
 * commande — `MarkOrderReadyCommand` ne fait rien sur une commande déjà prête.
 */
@Injectable()
@DurableHandler({ type: PACKING_ORDER_PACKED, subscriber: ON_PACKING_ORDER_PACKED })
export class OnPackingOrderPacked implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPackedEvent.fromPayload(delivery.payload);
    // L'identité et l'instant viennent du FAIT : la fermeture a eu lieu au colisage.
    await this.commands.execute(
      new MarkOrderReadyCommand(event.reference, event.packedBy, event.packedAt),
    );
  }
}
