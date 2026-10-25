import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  PACKING_SHORTFALL_REPORTED,
  PackingShortfallReportedEvent,
} from "../../../../packing/channels/commerce/index.js";
import { RecordOrderShortfallCommand } from "../commands/record-order-shortfall.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_SHORTFALL_REPORTED = "b2b.orders.record-shortfall-from-packing";

/**
 * **Le commerce apprend qu'il manque quelque chose au bac** (lot E6a,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3) : la commande passe
 * « décision attendue ». Rien d'autre — ni courriel, ni statut, ni argent.
 */
@Injectable()
@DurableHandler({ type: PACKING_SHORTFALL_REPORTED, subscriber: ON_PACKING_SHORTFALL_REPORTED })
export class OnPackingShortfallReported implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingShortfallReportedEvent.fromPayload(delivery.payload);
    // L'instant vient du FAIT : c'est lui qui départage deux signalements.
    await this.commands.execute(
      new RecordOrderShortfallCommand(event.reference, event.reportedAt, event.lines),
    );
  }
}
