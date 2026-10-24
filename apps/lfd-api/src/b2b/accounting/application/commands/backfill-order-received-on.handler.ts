import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { OrderDeliveryDays } from "../../domain/ports/order-delivery-days.js";
import { receivedOnOrDayOf } from "../../domain/services/monthly-invoicing.js";
import { BackfillOrderReceivedOnCommand } from "./backfill-order-received-on.command.js";

/**
 * **La reprise des dates de réception** (plan
 * `documentation/commandes/plan-date-de-reception.md`, §8).
 *
 * Elle n'est pas `RecordOrderDeliveryDayHandler` : celui-là ne pose rien
 * sans attestation de retrait, et c'est juste pour l'abonné qui l'appelle. La
 * reprise, elle, ne vise que des commandes REMISES (`handed_over_at` posé) :
 * elle applique la même fonction que la remise (B2), `receivedOnOrDayOf`, avec
 * son repli sur le jour de Paris de `handed_over_at` (Hugo, 2026-10-24).
 *
 * L'écriture reste conditionnée `received_on IS NULL` : une date déjà posée ne
 * bouge pas, et le déclencheur qui la fige ne mord pas. Rejouer est sans effet.
 */
@CommandHandler(BackfillOrderReceivedOnCommand)
export class BackfillOrderReceivedOnHandler implements ICommandHandler<
  BackfillOrderReceivedOnCommand,
  void
> {
  constructor(
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly deliveries: OrderDeliveryHistoryReader,
    private readonly days: OrderDeliveryDays,
  ) {}

  async execute(command: BackfillOrderReceivedOnCommand): Promise<void> {
    const { orderId } = command;
    const [handovers, stops] = await Promise.all([
      this.handovers.ofOrders([orderId]),
      this.deliveries.ofOrders([orderId]),
    ]);
    const day = receivedOnOrDayOf(
      handovers.get(orderId) ?? null,
      stops.filter((stop) => stop.orderId === orderId),
      command.handedOverAt,
    );
    await this.days.recordFirst(orderId, day);
  }
}
