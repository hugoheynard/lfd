import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { OrderDeliveryDays } from "../../domain/ports/order-delivery-days.js";
import { receivedOnOf } from "../../domain/services/monthly-invoicing.js";
import { RecordOrderDeliveryDayCommand } from "./record-order-delivery-day.command.js";

/**
 * **Le jour de livraison d'un bon devient une donnée du commerce** (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, §12, lot ZL).
 *
 * Il relit ce que le retrait et la livraison disent du bon, par leurs canaux
 * (`handover/channels/commerce/`, `delivery/channels/commerce/`), et applique
 * LA règle de la facture — `receivedOnOf` : le jour de la tournée qui l'a
 * remis à la porte, sinon le jour (Paris) du retrait. Elle n'est pas
 * réécrite ici.
 *
 * Posée une fois : la première remise attestée la fixe, et un bac ramené puis
 * relivré ne la déplace pas (`OrderDeliveryDays.recordFirst`). Un bon sans
 * retrait n'en reçoit pas : il reste hors de toute facture, et dans les
 * « Bons à constater » une fois son jour passé.
 */
@CommandHandler(RecordOrderDeliveryDayCommand)
export class RecordOrderDeliveryDayHandler implements ICommandHandler<
  RecordOrderDeliveryDayCommand,
  void
> {
  constructor(
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly deliveries: OrderDeliveryHistoryReader,
    private readonly days: OrderDeliveryDays,
  ) {}

  async execute(command: RecordOrderDeliveryDayCommand): Promise<void> {
    const { orderId } = command;
    const [handovers, stops] = await Promise.all([
      this.handovers.ofOrders([orderId]),
      this.deliveries.ofOrders([orderId]),
    ]);
    const day = receivedOnOf(
      handovers.get(orderId) ?? null,
      stops.filter((stop) => stop.orderId === orderId),
    );
    if (day !== null) {
      await this.days.recordFirst(orderId, day);
    }
  }
}
