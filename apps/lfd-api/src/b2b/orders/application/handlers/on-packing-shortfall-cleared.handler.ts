import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  PACKING_SHORTFALL_CLEARED,
  PackingShortfallClearedEvent,
} from "../../../../packing/channels/commerce/index.js";
import { ClearOrderShortfallCommand } from "../commands/clear-order-shortfall.command.js";
import { appliesToOrder } from "./later-shipment-guard.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_SHORTFALL_CLEARED = "b2b.orders.clear-shortfall-from-packing";

/**
 * **Le bac s'est fermé complet : le manque est levé** (lot E6a). La commande
 * n'attend plus de décision.
 */
@Injectable()
@DurableHandler({ type: PACKING_SHORTFALL_CLEARED, subscriber: ON_PACKING_SHORTFALL_CLEARED })
export class OnPackingShortfallCleared implements DurableSubscriber {
  private readonly logger = new Logger(OnPackingShortfallCleared.name);

  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingShortfallClearedEvent.fromPayload(delivery.payload);
    if (!appliesToOrder(event, PACKING_SHORTFALL_CLEARED, this.logger)) {
      return;
    }
    await this.commands.execute(new ClearOrderShortfallCommand(event.reference, event.clearedAt));
  }
}
