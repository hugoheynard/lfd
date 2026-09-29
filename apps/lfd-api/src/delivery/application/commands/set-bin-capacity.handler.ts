import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinCapacity } from "../../domain/entities/bin-capacity.js";
import { BinCapacitySetEvent } from "../../domain/events/bin-type.events.js";
import { BinCapacityRepository } from "../../domain/ports/bin-capacity.repository.js";
import { BinTypeRepository } from "../../domain/ports/bin-type.repository.js";
import { loadBinType } from "../bin-type-support.js";
import { SetBinCapacityCommand } from "./set-bin-capacity.command.js";

/**
 * Pose ou retire UNE contenance (L4b-C2). Le SKU n'est pas vérifié contre le
 * catalogue : il est opaque, et une case d'un produit qui ne se vend plus doit
 * pouvoir se vider. Une case inchangée n'écrit rien et ne trace rien.
 *
 * @throws {BinTypeNotFoundError} @throws {InvalidBinCapacityError}
 * @throws {BinTypeArchivedForCapacityError}
 */
@CommandHandler(SetBinCapacityCommand)
export class SetBinCapacityHandler implements ICommandHandler<SetBinCapacityCommand, void> {
  constructor(
    private readonly types: BinTypeRepository,
    private readonly capacities: BinCapacityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetBinCapacityCommand): Promise<void> {
    const { binTypeId, sku, units } = command.payload;
    // Validée avant toute lecture : une saisie hors bornes se refuse sans base.
    const capacity = units === null ? null : BinCapacity.of({ binTypeId, sku, units });
    await this.uow.run(async () => {
      const binType = await loadBinType(this.types, binTypeId);
      const before = await this.capacities.unitsOf(binTypeId, sku);
      if (before === units) {
        return;
      }
      if (capacity === null) {
        await this.capacities.remove(binTypeId, sku);
      } else {
        binType.ensureAcceptsCapacity();
        await this.capacities.save(capacity, this.clock.now());
      }
      await this.events.publishTraced(new BinCapacitySetEvent(binType, sku, before, units));
    });
  }
}
