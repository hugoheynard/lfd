import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinTypeArchivedEvent } from "../../domain/events/bin-type.events.js";
import { BinTypeRepository } from "../../domain/ports/bin-type.repository.js";
import { loadBinType } from "../bin-type-support.js";
import { ArchiveBinTypeCommand } from "./archive-bin-type.command.js";

/**
 * Archive un type de bac, daté du `Clock`. Il reste au catalogue, lisible sur
 * ce qui le cite (v2-7), et son nom se libère. Ses contenances restent en
 * base : réactivé, il les retrouve.
 *
 * @throws {BinTypeNotFoundError} @throws {BinTypeAlreadyArchivedError}
 */
@CommandHandler(ArchiveBinTypeCommand)
export class ArchiveBinTypeHandler implements ICommandHandler<ArchiveBinTypeCommand, void> {
  constructor(
    private readonly types: BinTypeRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveBinTypeCommand): Promise<void> {
    await this.uow.run(async () => {
      const binType = await loadBinType(this.types, command.binTypeId);
      binType.archive(this.clock.now());
      await this.types.save(binType);
      await this.events.publishTraced(new BinTypeArchivedEvent(binType));
    });
  }
}
