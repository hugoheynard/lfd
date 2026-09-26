import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderPaymentSettledEvent } from "../../../orders/domain/events/order-payment-settled.event.js";
import { CreditOrderPointsCommand } from "../commands/credit-order-points.command.js";

/**
 * Le règlement vient d'être **acquis** : si la commande était déjà remise,
 * elle est définitive et rapporte ses points (plan D3). Le cas ordinaire au
 * comptoir est l'inverse — payée d'abord, remise ensuite — et c'est alors
 * l'abonné de la remise qui crédite.
 */
@EventsHandler(OrderPaymentSettledEvent)
export class CreditPointsOnPaymentSettled implements IEventHandler<OrderPaymentSettledEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPaymentSettledEvent): void {
    void this.work.track(this.run(event), "credit-points-on-payment-settled");
  }

  private async run(event: OrderPaymentSettledEvent): Promise<void> {
    await this.commands.execute<CreditOrderPointsCommand, boolean>(
      new CreditOrderPointsCommand(event.orderId),
    );
  }
}
