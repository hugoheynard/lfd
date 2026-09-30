import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseVehicleCandidateArchivedEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseVehicleCandidateRepository } from "../../domain/ports/purchase-vehicle-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { loadVehicleCandidate } from "../purchase-candidate-support.js";
import { ArchivePurchaseVehicleCandidateCommand } from "./archive-purchase-vehicle-candidate.command.js";

/**
 * Archive un véhicule candidat, daté du `Clock` : il sort de la liste courante, son nom se libère. Il reste lisible avec `?archives=inclure`.
 *
 * @throws {PurchaseCandidateNotFoundError} @throws {PurchaseCandidateAlreadyArchivedError}
 */
@CommandHandler(ArchivePurchaseVehicleCandidateCommand)
export class ArchivePurchaseVehicleCandidateHandler implements ICommandHandler<
  ArchivePurchaseVehicleCandidateCommand,
  void
> {
  constructor(
    private readonly candidates: PurchaseVehicleCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchivePurchaseVehicleCandidateCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const candidate = await loadVehicleCandidate(this.candidates, command.candidateId);
      candidate.archive(this.clock.now(), author);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseVehicleCandidateArchivedEvent(candidate));
    });
  }
}
