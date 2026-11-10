import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { CustomerRequestNotFoundError } from "../../domain/errors/contact-errors.js";
import { OrderChangeRefusedEvent } from "../../domain/order-change.events.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { OrderChangeRefusedMail } from "../services/order-change-refused-mail.service.js";
import { RefuseOrderChangeCommand } from "./refuse-order-change.command.js";

/**
 * **Refuser une demande de modification** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) : la
 * commande ne bouge pas ; la demande est traitée avec le mot adressé au
 * client, qui le reçoit par courriel et le lit sur sa commande. La ligne de
 * la demande est verrouillée, comme pour « Appliquer » : les deux réponses ne
 * se croisent pas. Le courriel est demandé au bloc `mail` dans la même unité
 * de travail (S2c, `plan-service-e-mails.md`).
 */
@CommandHandler(RefuseOrderChangeCommand)
export class RefuseOrderChangeHandler implements ICommandHandler<RefuseOrderChangeCommand, void> {
  constructor(
    private readonly requests: CustomerRequestRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly mail: OrderChangeRefusedMail,
  ) {}

  async execute(command: RefuseOrderChangeCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const request = await this.requests.lockForAnswer(command.requestId);
      if (request === null) {
        throw new CustomerRequestNotFoundError(command.requestId);
      }
      const { order, baseRevision } = request.pendingOrderChange();
      const reason = request.refuseChange(command.reason, author, this.clock.now());
      await this.requests.save(request);
      const answered = new OrderChangeRefusedEvent(
        request,
        { requestId: request.id, order, baseRevision },
        reason,
      );
      await this.mail.request(answered);
      await this.events.publishTraced(answered);
    });
  }
}
