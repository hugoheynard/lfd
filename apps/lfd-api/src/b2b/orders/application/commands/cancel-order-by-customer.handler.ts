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
 * 3. P2 (si le délai est imposé) pour une commande personnelle, puis le noyau staff à l'identique
 *    (`CustomerOrderCancellation`).
 *
 * L'instant est lu UNE fois (`now` gelé de la requête, S5). Quand le mur
 * admet par le compte PRINCIPAL (lot C1 des sous-comptes, §7.9), le principal
 * voyage jusqu'au fait : le courriel et le journal le disent.
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
    const standing = subject === null ? null : await this.wall.standingOf(subject, command.userId);
    if (subject === null || standing === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    await this.cancellation.cancel({
      subject,
      actor: { kind: "customer", userId: command.userId },
      reason,
      now: this.clock.now(),
      fromPrincipal: standing.via === "principal" ? standing.principal : null,
    });
  }
}
