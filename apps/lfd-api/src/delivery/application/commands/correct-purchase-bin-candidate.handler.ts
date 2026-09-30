import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseBinCandidateCorrectedEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseBinCandidateRepository } from "../../domain/ports/purchase-bin-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensureBinCandidateNameFree, loadBinCandidate } from "../purchase-candidate-support.js";
import { CorrectPurchaseBinCandidateCommand } from "./correct-purchase-bin-candidate.command.js";

/**
 * Corrige la fiche d'un format de bac candidat. Le fait porte l'avant et l'après.
 *
 * @throws {PurchaseCandidateNotFoundError} @throws {InvalidPurchaseCandidateNameError} @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
 * @throws {InvalidBinMaxStackError}
 * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
 * @throws {InvalidPurchasePriceError} @throws {PurchaseCandidateNameTakenError}
 */
@CommandHandler(CorrectPurchaseBinCandidateCommand)
export class CorrectPurchaseBinCandidateHandler implements ICommandHandler<
  CorrectPurchaseBinCandidateCommand,
  void
> {
  constructor(
    private readonly candidates: PurchaseBinCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectPurchaseBinCandidateCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const candidate = await loadBinCandidate(this.candidates, command.candidateId);
      const before = candidate.specification;
      candidate.correct(command.payload, this.clock.now(), author);
      await ensureBinCandidateNameFree(this.candidates, candidate);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseBinCandidateCorrectedEvent(candidate, before));
    });
  }
}
