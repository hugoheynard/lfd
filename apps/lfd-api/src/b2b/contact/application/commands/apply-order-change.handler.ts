import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { CustomerRequestNotFoundError } from "../../domain/errors/contact-errors.js";
import { OrderChangeUnreadableError } from "../../domain/errors/order-change-errors.js";
import { OrderChangeAppliedEvent } from "../../domain/order-change.events.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { OrderChangeApplier } from "../../domain/ports/order-change.applier.js";
import { ApplyOrderChangeCommand } from "./apply-order-change.command.js";

/**
 * **Appliquer une demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §4, M4) : c'est une
 * RÉVISION de la commande au nom de l'équipe, par le même geste que
 * « Modifier la commande » ({@link OrderChangeApplier}), qui rejuge tout —
 * inscrite au plan entre-temps, modifiée ailleurs depuis la demande (R7),
 * réglée par carte, rien qui change. Son refus remonte tel quel, et la
 * demande reste en attente : l'équipe peut alors la refuser avec un mot.
 *
 * **Une seule unité de travail**, la ligne de la demande verrouillée d'abord :
 * la révision et la réponse partent ensemble ou pas du tout — jamais une
 * commande modifiée sous une demande restée « en attente », ni une demande
 * « appliquée » sans révision. Une réponse concurrente attend, puis lit la
 * demande traitée. Le prix : la recomposition de la révision tient la
 * transaction le temps de ses lectures (un geste rare, à la main).
 */
@CommandHandler(ApplyOrderChangeCommand)
export class ApplyOrderChangeHandler implements ICommandHandler<ApplyOrderChangeCommand, number> {
  constructor(
    private readonly requests: CustomerRequestRepository,
    private readonly applier: OrderChangeApplier,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ApplyOrderChangeCommand): Promise<number> {
    const author = await authorOf(this.staff, command.staffUserId);
    return this.uow.run(async () => {
      const request = await this.requests.lockForAnswer(command.requestId);
      if (request === null) {
        throw new CustomerRequestNotFoundError(command.requestId);
      }
      const pending = request.pendingOrderChange();
      if (pending.change === null) {
        throw new OrderChangeUnreadableError(request.id);
      }
      const applied = await this.applier.apply(
        pending.order.id,
        command.staffUserId,
        pending.baseRevision,
        pending.change,
      );
      request.recordChangeApplied(applied.revision, author, this.clock.now());
      await this.requests.save(request);
      await this.events.publishTraced(
        new OrderChangeAppliedEvent(
          request,
          { requestId: request.id, order: pending.order, baseRevision: pending.baseRevision },
          applied,
        ),
      );
      return applied.revision;
    });
  }
}
