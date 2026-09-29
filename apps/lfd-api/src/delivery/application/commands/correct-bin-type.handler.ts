import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinTypeCorrectedEvent } from "../../domain/events/bin-type.events.js";
import { BinTypeRepository } from "../../domain/ports/bin-type.repository.js";
import { ensureBinTypeNameFree, loadBinType } from "../bin-type-support.js";
import { CorrectBinTypeCommand } from "./correct-bin-type.command.js";

/**
 * Corrige la fiche d'un type de bac. Le fait porte l'avant et l'après.
 *
 * @throws {BinTypeNotFoundError} @throws {InvalidBinTypeNameError}
 * @throws {InvalidBinDimensionsError} @throws {BinInnerExceedsOuterError}
 * @throws {InvalidBinMaxStackError} @throws {BinTypeNameTakenError}
 */
@CommandHandler(CorrectBinTypeCommand)
export class CorrectBinTypeHandler implements ICommandHandler<CorrectBinTypeCommand, void> {
  constructor(
    private readonly types: BinTypeRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectBinTypeCommand): Promise<void> {
    await this.uow.run(async () => {
      const binType = await loadBinType(this.types, command.binTypeId);
      const before = binType.specification;
      binType.correct(command.payload, this.clock.now());
      await ensureBinTypeNameFree(this.types, binType);
      await this.types.save(binType);
      await this.events.publishTraced(new BinTypeCorrectedEvent(binType, before));
    });
  }
}
