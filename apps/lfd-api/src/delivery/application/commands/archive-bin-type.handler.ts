import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinTypeArchivedEvent } from "../../domain/events/bin-type.events.js";
import { ActiveBinTypesReader } from "../../domain/ports/composition-prerequisites.readers.js";
import { BinTypeRepository } from "../../domain/ports/bin-type.repository.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import { ensureActiveBinTypeRemains } from "../../domain/services/composition-prerequisites.js";
import { ensureNotDefaultContainer } from "../../domain/services/default-container.js";
import { loadBinType } from "../bin-type-support.js";
import { ArchiveBinTypeCommand } from "./archive-bin-type.command.js";

/**
 * Archive un type de bac, daté du `Clock`. Il reste au catalogue, lisible sur
 * ce qui le cite (v2-7), et son nom se libère. Ses contenances restent en
 * base : réactivé, il les retrouve.
 *
 * **Refusé si c'est le dernier type en service** (CA-D3) : sans lui, les
 * tournées ne se proposent plus. **Refusé aussi si c'est le contenant par
 * défaut d'une commande** dans les réglages du calcul (2026-10-06) : le
 * bureau choisit un autre type ou vide le réglage, rien ne change en silence.
 *
 * @throws {BinTypeNotFoundError} @throws {BinTypeAlreadyArchivedError}
 * @throws {LastActiveBinTypeError} @throws {DefaultContainerBinTypeArchiveError}
 */
@CommandHandler(ArchiveBinTypeCommand)
export class ArchiveBinTypeHandler implements ICommandHandler<ArchiveBinTypeCommand, void> {
  constructor(
    private readonly types: BinTypeRepository,
    private readonly active: ActiveBinTypesReader,
    private readonly settings: RoutingSettingsReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveBinTypeCommand): Promise<void> {
    await this.uow.run(async () => {
      const binType = await loadBinType(this.types, command.binTypeId);
      ensureActiveBinTypeRemains(binType, await this.active.activeIds());
      const settings = await this.settings.current();
      ensureNotDefaultContainer(binType, settings?.defaultContainer ?? null);
      binType.archive(this.clock.now());
      await this.types.save(binType);
      await this.events.publishTraced(new BinTypeArchivedEvent(binType));
    });
  }
}
