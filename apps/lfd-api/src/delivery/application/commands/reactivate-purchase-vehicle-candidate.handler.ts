import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseVehicleCandidateReactivatedEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseVehicleCandidateRepository } from "../../domain/ports/purchase-vehicle-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import {
  ensureVehicleCandidateNameFree,
  loadVehicleCandidate,
} from "../purchase-candidate-support.js";
import { ReactivatePurchaseVehicleCandidateCommand } from "./reactivate-purchase-vehicle-candidate.command.js";

/**
 * Réactive un véhicule candidat : il revient dans la liste courante, si son nom n'a pas été repris entre-temps.
 *
 * @throws {PurchaseCandidateNotFoundError} @throws {PurchaseCandidateNotArchivedError}
 * @throws {PurchaseCandidateNameTakenError}
 */
@CommandHandler(ReactivatePurchaseVehicleCandidateCommand)
export class ReactivatePurchaseVehicleCandidateHandler implements ICommandHandler<
  ReactivatePurchaseVehicleCandidateCommand,
  void
> {
  constructor(
    private readonly candidates: PurchaseVehicleCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReactivatePurchaseVehicleCandidateCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const candidate = await loadVehicleCandidate(this.candidates, command.candidateId);
      candidate.reactivate(this.clock.now(), author);
      await ensureVehicleCandidateNameFree(this.candidates, candidate);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseVehicleCandidateReactivatedEvent(candidate));
    });
  }
}
