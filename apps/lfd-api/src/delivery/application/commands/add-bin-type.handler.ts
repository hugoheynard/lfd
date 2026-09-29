import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinType } from "../../domain/entities/bin-type.js";
import { BinTypeAddedEvent } from "../../domain/events/bin-type.events.js";
import { BinTypeRepository } from "../../domain/ports/bin-type.repository.js";
import { ensureBinTypeNameFree } from "../bin-type-support.js";
import { AddBinTypeCommand } from "./add-bin-type.command.js";

/**
 * Un type de bac entre au catalogue, en service. L'écriture et sa trace
 * partent ensemble.
 *
 * @throws {InvalidBinTypeNameError} @throws {InvalidBinDimensionsError}
 * @throws {BinInnerExceedsOuterError} @throws {InvalidBinMaxStackError}
 * @throws {BinTypeNameTakenError}
 */
@CommandHandler(AddBinTypeCommand)
export class AddBinTypeHandler implements ICommandHandler<AddBinTypeCommand, string> {
  constructor(
    private readonly types: BinTypeRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddBinTypeCommand): Promise<string> {
    const binType = BinType.declare({
      ...command.payload,
      id: this.ids.next(),
      at: this.clock.now(),
    });
    await this.uow.run(async () => {
      await ensureBinTypeNameFree(this.types, binType);
      await this.types.save(binType);
      await this.events.publishTraced(new BinTypeAddedEvent(binType));
    });
    return binType.id;
  }
}
