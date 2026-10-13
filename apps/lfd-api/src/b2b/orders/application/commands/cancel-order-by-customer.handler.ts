import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { CustomerCancellationSubjectReader } from "../../domain/ports/customer-cancellation-subject.reader.js";
import { CustomerCancellationReason } from "../../domain/value-objects/customer-cancellation-reason.js";
import { CancellationWall } from "../services/cancellation-wall.js";
import { CustomerOrderCancellation } from "../services/customer-order-cancellation.js";
import { CancelOrderByCustomerCommand } from "./cancel-order-by-customer.command.js";

/**
 * **L'annulation par le client connecté** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.2,
 * C6.3, C6.6), dans cet ordre :
 *
 * 1. le motif (forme métier), avant toute lecture ;
 * 2. le mur, sur la commande lue par son id — un `404` identique pour
 *    l'inconnue et l'interdite, jamais un `403` ;
 * 3. P1/P2 pour une commande personnelle, puis le noyau staff à l'identique
 *    (`CustomerOrderCancellation`).
 *
 * L'instant est lu UNE fois (`now` gelé de la requête, S5).
 */
@CommandHandler(CancelOrderByCustomerCommand)
export class CancelOrderByCustomerHandler implements ICommandHandler<
  CancelOrderByCustomerCommand,
  void
> {
  constructor(
    private readonly subjects: CustomerCancellationSubjectReader,
    private readonly wall: CancellationWall,
    private readonly cancellation: CustomerOrderCancellation,
    private readonly clock: Clock,
  ) {}

  async execute(command: CancelOrderByCustomerCommand): Promise<void> {
    const reason = CustomerCancellationReason.of(command.reasonCode, command.reasonText);
    const subject = await this.subjects.find(command.orderId);
    if (subject === null || !(await this.wall.mayCancel(subject, command.userId))) {
      throw new OrderNotFoundError(command.orderId);
    }
    await this.cancellation.cancel({
      subject,
      actor: { kind: "customer", userId: command.userId },
      reason,
      now: this.clock.now(),
    });
  }
}
