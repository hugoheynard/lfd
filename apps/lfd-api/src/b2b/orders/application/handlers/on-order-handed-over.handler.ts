import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
} from "../../../../handover/channels/commerce/index.js";
import { MarkOrderFulfilledCommand } from "../commands/mark-order-fulfilled.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_ORDER_HANDED_OVER = "b2b.orders.mark-fulfilled";

/**
 * **Le commerce apprend qu'une commande a été retirée**, et ferme la sienne.
 *
 * Même figure que `OnPackingOrderPacked`, et pour la même raison : ce qui change n'est
 * pas ce que le commerce fait, c'est **qui le déclenche**. Le retrait, par un
 * fait — et non plus une route hébergée ici, sur un geste que le commerce ne
 * voit pas.
 *
 * ⚠️ Le fait écouté est celui du **retrait** (`handover.handed_over`), pas
 * celui que le commerce écrit ensuite (`order.fulfilled`) : deux types
 * distincts pour deux classes homonymes (plan
 * `documentation/journalisation/plan-evenements-durables.md`, §3).
 *
 * ## Abonné DURABLE depuis le 2026-10-04 (lot E2)
 *
 * Jusque-là, le fait passait par le bus en mémoire : un container qui tombait
 * entre l'attestation et cette écriture laissait la commande `ready` avec un
 * sac parti, et seul un rescan rattrapait. Livré au moins une fois désormais ;
 * la garde du relais pose le reçu dans la même unité de travail que
 * l'écriture, et `MarkOrderFulfilledCommand` ne fait rien sur une commande
 * déjà retirée (réannonce, rejeu).
 */
@Injectable()
@DurableHandler({ type: HANDOVER_HANDED_OVER, subscriber: ON_ORDER_HANDED_OVER })
export class OnOrderHandedOver implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    // L'identité et l'instant viennent du FAIT, pas de l'horloge d'ici : le
    // retrait a eu lieu au comptoir ou à la porte, et c'est cette heure-là.
    await this.commands.execute(
      new MarkOrderFulfilledCommand(
        event.reference,
        event.handedOverBy,
        event.handedOverAt,
        event.via,
      ),
    );
  }
}
