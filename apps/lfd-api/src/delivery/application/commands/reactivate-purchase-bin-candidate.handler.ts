import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseBinCandidateReactivatedEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseBinCandidateRepository } from "../../domain/ports/purchase-bin-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensureBinCandidateNameFree, loadBinCandidate } from "../purchase-candidate-support.js";
import { ReactivatePurchaseBinCandidateCommand } from "./reactivate-purchase-bin-candidate.command.js";

/**
 * Réactive un format de bac candidat : il revient dans la liste courante, si son nom n'a pas été repris entre-temps.
 *
 * @throws {PurchaseCandidateNotFoundError} @throws {PurchaseCandidateNotArchivedError}
 * @throws {PurchaseCandidateNameTakenError}
 */
@CommandHandler(ReactivatePurchaseBinCandidateCommand)
export class ReactivatePurchaseBinCandidateHandler implements ICommandHandler<
  ReactivatePurchaseBinCandidateCommand,
  void
> {
  constructor(
    private readonly candidates: PurchaseBinCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReactivatePurchaseBinCandidateCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const candidate = await loadBinCandidate(this.candidates, command.candidateId);
      candidate.reactivate(this.clock.now(), author);
      await ensureBinCandidateNameFree(this.candidates, candidate);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseBinCandidateReactivatedEvent(candidate));
    });
  }
}
