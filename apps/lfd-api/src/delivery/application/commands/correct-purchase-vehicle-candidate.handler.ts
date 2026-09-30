import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseVehicleCandidateCorrectedEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseVehicleCandidateRepository } from "../../domain/ports/purchase-vehicle-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import {
  ensureVehicleCandidateNameFree,
  loadVehicleCandidate,
} from "../purchase-candidate-support.js";
import { CorrectPurchaseVehicleCandidateCommand } from "./correct-purchase-vehicle-candidate.command.js";

/**
 * Corrige la fiche d'un véhicule candidat. Le fait porte l'avant et l'après.
 *
 * @throws {PurchaseCandidateNotFoundError} @throws {InvalidPurchaseCandidateNameError} @throws {InvalidCargoDimensionsError} @throws {InvalidWheelArchesError}
 * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
 * @throws {InvalidPurchasePriceError} @throws {PurchaseCandidateNameTakenError}
 */
@CommandHandler(CorrectPurchaseVehicleCandidateCommand)
export class CorrectPurchaseVehicleCandidateHandler implements ICommandHandler<
  CorrectPurchaseVehicleCandidateCommand,
  void
> {
  constructor(
    private readonly candidates: PurchaseVehicleCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectPurchaseVehicleCandidateCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const candidate = await loadVehicleCandidate(this.candidates, command.candidateId);
      const before = candidate.specification;
      candidate.correct(command.payload, this.clock.now(), author);
      await ensureVehicleCandidateNameFree(this.candidates, candidate);
      await this.candidates.save(candidate);
      await this.events.publishTraced(
        new PurchaseVehicleCandidateCorrectedEvent(candidate, before),
      );
    });
  }
}
