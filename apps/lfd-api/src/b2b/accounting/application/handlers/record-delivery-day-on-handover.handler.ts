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
import { RecordOrderDeliveryDayCommand } from "../commands/record-order-delivery-day.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_DELIVERY_DAY_ON_HANDOVER = "accounting.record-delivery-day.on-handover";

/**
 * **Une remise est attestée : le bon reçoit son jour de livraison** (lot ZL).
 *
 * Le fait écouté est celui du RETRAIT (`handover.handed_over`) : c'est le
 * seul qui atteste qu'une marchandise a changé de mains, au comptoir comme à
 * la porte (`HandoverDoorstepAttestor` l'écrit aussi). La livraison ne publie
 * vers le commerce aucun fait de remise — son départ (`delivery.round_departed`)
 * n'en est pas une (lu le 2026-10-22 dans `delivery/channels/commerce/index.ts`) ;
 * ses arrêts sont LUS au moment du retrait, par son canal.
 *
 * Abonné durable, un fait d'un autre bloc (`lint:durable-cross-block`) ;
 * livré au moins une fois, et la réannonce d'un retrait arrive comme un fait
 * neuf : la commande ne pose le jour que s'il est absent.
 *
 * ⚠️ **En sursis depuis le 2026-10-24** (`documentation/commandes/plan-date-de-reception.md`,
 * B2) : `MarkOrderFulfilledHandler` pose `received_on` dans la même écriture
 * que la remise. Cet abonné ne pose plus rien quand il passe après, et ce
 * qu'il pose quand il passe avant est la même règle, que la remise ne
 * réécrit pas. Il est retiré au troisième temps (B4), après contrôle de la
 * boîte d'envoi.
 */
@Injectable()
@DurableHandler({ type: HANDOVER_HANDED_OVER, subscriber: RECORD_DELIVERY_DAY_ON_HANDOVER })
export class RecordDeliveryDayOnHandover implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    await this.commands.execute(new RecordOrderDeliveryDayCommand(event.orderId));
  }
}
