import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderHandedOverEvent } from "../../../orders/domain/events/order-handed-over.event.js";
import { CreditOrderPointsCommand } from "../commands/credit-order-points.command.js";

/**
 * La commande vient d'être **remise** : si elle était déjà réglée, elle est
 * définitive et rapporte ses points (plan D3). Sinon, rien — le règlement,
 * quand il viendra, tentera à son tour.
 *
 * Il écoute le fait du COMMERCE (`b2b/orders/domain/events/`), pas celui du
 * canal de la remise : c'est le commerce qui a écrit `fulfilled`.
 */
@EventsHandler(OrderHandedOverEvent)
export class CreditPointsOnHandover implements IEventHandler<OrderHandedOverEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderHandedOverEvent): void {
    void this.work.track(this.run(event), "credit-points-on-handover");
  }

  private async run(event: OrderHandedOverEvent): Promise<void> {
    await this.commands.execute<CreditOrderPointsCommand, boolean>(
      new CreditOrderPointsCommand(event.orderId),
    );
  }
}
