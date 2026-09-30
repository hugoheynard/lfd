import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseBinCandidateArchivedEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseBinCandidateRepository } from "../../domain/ports/purchase-bin-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { loadBinCandidate } from "../purchase-candidate-support.js";
import { ArchivePurchaseBinCandidateCommand } from "./archive-purchase-bin-candidate.command.js";

/**
 * Archive un format de bac candidat, daté du `Clock` : il sort de la liste courante, son nom se libère. Il reste lisible avec `?archives=inclure`.
 *
 * @throws {PurchaseCandidateNotFoundError} @throws {PurchaseCandidateAlreadyArchivedError}
 */
@CommandHandler(ArchivePurchaseBinCandidateCommand)
export class ArchivePurchaseBinCandidateHandler implements ICommandHandler<
  ArchivePurchaseBinCandidateCommand,
  void
> {
  constructor(
    private readonly candidates: PurchaseBinCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchivePurchaseBinCandidateCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const candidate = await loadBinCandidate(this.candidates, command.candidateId);
      candidate.archive(this.clock.now(), author);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseBinCandidateArchivedEvent(candidate));
    });
  }
}
