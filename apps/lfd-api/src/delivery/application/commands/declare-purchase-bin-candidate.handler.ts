import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseBinCandidate } from "../../domain/entities/purchase-bin-candidate.js";
import { PurchaseBinCandidateDeclaredEvent } from "../../domain/events/purchase-candidate.events.js";
import { PurchaseBinCandidateRepository } from "../../domain/ports/purchase-bin-candidate.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensureBinCandidateNameFree } from "../purchase-candidate-support.js";
import { DeclarePurchaseBinCandidateCommand } from "./declare-purchase-bin-candidate.command.js";

/**
 * Un format de bac candidat entre dans la bibliothèque d'achat
 * (`plan-bibliotheque-d-achat.md`, lot B1). L'écriture et sa trace partent
 * ensemble ; l'auteur est figé.
 *
 * @throws {InvalidPurchaseCandidateNameError} @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
 * @throws {InvalidBinMaxStackError}
 * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
 * @throws {InvalidPurchasePriceError} @throws {PurchaseCandidateNameTakenError}
 */
@CommandHandler(DeclarePurchaseBinCandidateCommand)
export class DeclarePurchaseBinCandidateHandler implements ICommandHandler<
  DeclarePurchaseBinCandidateCommand,
  string
> {
  constructor(
    private readonly candidates: PurchaseBinCandidateRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclarePurchaseBinCandidateCommand): Promise<string> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    const candidate = PurchaseBinCandidate.declare({
      ...command.payload,
      id: this.ids.next(),
      at: this.clock.now(),
      author,
    });
    await this.uow.run(async () => {
      await ensureBinCandidateNameFree(this.candidates, candidate);
      await this.candidates.save(candidate);
      await this.events.publishTraced(new PurchaseBinCandidateDeclaredEvent(candidate));
    });
    return candidate.id;
  }
}
