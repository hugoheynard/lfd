import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompletedOrderReader } from "../../../orders/domain/ports/completed-order.reader.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { OrderPointsCrediting } from "../services/order-points-crediting.js";
import { CreditOrderPointsCommand } from "./credit-order-points.command.js";

/**
 * Crédite une commande, appelé par les deux abonnés (remise, règlement).
 *
 * Il ne sait pas lequel des deux faits est arrivé en second, et n'a pas à le
 * savoir : il relit l'ÉTAT. Au premier fait, la commande n'est pas encore
 * définitive et il ne fait rien ; au second, elle l'est et il crédite (D3).
 * `@sans-journal` n'est pas de mise : le gain se trace, par le service.
 */
@CommandHandler(CreditOrderPointsCommand)
export class CreditOrderPointsHandler implements ICommandHandler<
  CreditOrderPointsCommand,
  boolean
> {
  constructor(
    private readonly orders: CompletedOrderReader,
    private readonly settings: LoyaltySettingsReader,
    private readonly crediting: OrderPointsCrediting,
  ) {}

  async execute(command: CreditOrderPointsCommand): Promise<boolean> {
    const order = await this.orders.findCompleted(command.orderId);
    if (order === null) {
      return false;
    }
    return this.crediting.creditEarnedPoints(order, await this.settings.read());
  }
}
