import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderAccessReader } from "../../domain/ports/order-access.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { OrderCardAdoption } from "../../domain/ports/order-card-payments.js";
import { AdoptOrderPaymentCommand } from "./adopt-order-payment.command.js";

/**
 * Rattache au bloc `card-payment` l'intention d'une commande d'avant lui
 * (plan M2, §4.6), à l'état que la commande déclare.
 *
 * Le mur est celui de la page de règlement — qui peut la voir peut la payer,
 * donc la faire adopter : le geste ne crée rien, il range ce qui existe. Une
 * commande sans intention n'a rien à adopter : rien n'est écrit.
 *
 * @sans-journal Rangement technique d'une intention déjà créée, sans effet
 * sur la commande ni sur l'argent — la ligne naît à l'état que la commande
 * déclare, comme le rattrapage horaire l'aurait fait.
 */
@CommandHandler(AdoptOrderPaymentCommand)
export class AdoptOrderPaymentHandler implements ICommandHandler<AdoptOrderPaymentCommand, void> {
  constructor(
    private readonly access: OrderAccessReader,
    private readonly orders: OrderReader,
    private readonly cards: OrderCardAdoption,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: AdoptOrderPaymentCommand): Promise<void> {
    const owned = await this.orders.findById(command.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    const role =
      owned.companyId === null ? null : await this.access.accessToOrder(command.actorUserId, owned);
    ensureOrderVisible(owned, command.actorUserId, role, command.orderId);
    await this.unitOfWork.run(() => this.cards.ensureFirst(command.orderId));
  }
}
