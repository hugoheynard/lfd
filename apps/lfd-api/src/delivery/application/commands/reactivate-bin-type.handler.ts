import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinTypeReactivatedEvent } from "../../domain/events/bin-type.events.js";
import { BinTypeRepository } from "../../domain/ports/bin-type.repository.js";
import { ensureBinTypeNameFree, loadBinType } from "../bin-type-support.js";
import { ReactivateBinTypeCommand } from "./reactivate-bin-type.command.js";

/**
 * Remet un type archivé en service — refusé si un autre type en service a
 * pris son nom entre-temps.
 *
 * @throws {BinTypeNotFoundError} @throws {BinTypeNotArchivedError}
 * @throws {BinTypeNameTakenError}
 */
@CommandHandler(ReactivateBinTypeCommand)
export class ReactivateBinTypeHandler implements ICommandHandler<ReactivateBinTypeCommand, void> {
  constructor(
    private readonly types: BinTypeRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReactivateBinTypeCommand): Promise<void> {
    await this.uow.run(async () => {
      const binType = await loadBinType(this.types, command.binTypeId);
      binType.reactivate(this.clock.now());
      await ensureBinTypeNameFree(this.types, binType);
      await this.types.save(binType);
      await this.events.publishTraced(new BinTypeReactivatedEvent(binType));
    });
  }
}
