import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseVehicleCandidate } from "../../domain/entities/purchase-vehicle-candidate.js";
import { PurchaseVehicleCandidateDeclaredEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseVehicleCandidateRepository } from "../../domain/ports/purchase-vehicle-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensureVehicleCandidateNameFree } from "../purchase-candidate-support.js";
import { DeclarePurchaseVehicleCandidateCommand } from "./declare-purchase-vehicle-candidate.command.js";

/**
 * Un véhicule candidat entre dans la bibliothèque d'achat
 * (`plan-bibliotheque-d-achat.md`, lot B1). L'écriture et sa trace partent
 * ensemble ; l'auteur est figé.
 *
 * @throws {InvalidPurchaseCandidateNameError} @throws {InvalidCargoDimensionsError} @throws {InvalidWheelArchesError}
 * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
 * @throws {InvalidPurchasePriceError} @throws {PurchaseCandidateNameTakenError}
 */
@CommandHandler(DeclarePurchaseVehicleCandidateCommand)
export class DeclarePurchaseVehicleCandidateHandler implements ICommandHandler<
  DeclarePurchaseVehicleCandidateCommand,
  string
> {
  constructor(
    private readonly candidates: PurchaseVehicleCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclarePurchaseVehicleCandidateCommand): Promise<string> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    const candidate = PurchaseVehicleCandidate.declare({
      ...command.payload,
      id: this.ids.next(),
      at: this.clock.now(),
      author,
    });
    await this.uow.run(async () => {
      await ensureVehicleCandidateNameFree(this.candidates, candidate);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseVehicleCandidateDeclaredEvent(candidate));
    });
    return candidate.id;
  }
}
