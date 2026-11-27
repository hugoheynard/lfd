import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { OptionGroupHoldersReader } from "../domain/ports/option-group-holders.reader.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";
import { requireOptionGroup } from "./option-group-support.js";

export class ArchiveOptionGroupCommand {
  constructor(readonly id: string) {}
}

/**
 * Archive un groupe : il ne se propose plus, ne s'active plus, et quitte le
 * fait des fiches qui l'activent — réémises après la transaction. Les
 * activations restent : une restauration le repropose où il l'était.
 * Rejoué sur un groupe archivé : ni écriture, ni fait, ni réémission.
 */
@CommandHandler(ArchiveOptionGroupCommand)
export class ArchiveOptionGroupHandler implements ICommandHandler<ArchiveOptionGroupCommand, void> {
  constructor(
    private readonly groups: OptionGroupRepository,
    private readonly holders: OptionGroupHoldersReader,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: ArchiveOptionGroupCommand): Promise<void> {
    const archived = await this.uow.run(async () => {
      const group = await requireOptionGroup(this.groups, command.id);
      if (!group.archive(this.clock.now())) {
        return false;
      }
      const { name } = group.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.optionGroupArchived,
        subjectType: "option_group",
        subjectId: group.id,
        payload: { subjectLabel: name, name },
      });
      await this.groups.save(group, ticket);
      return true;
    });
    if (archived) {
      await this.reemission.products(await this.holders.productsHolding(command.id));
    }
  }
}
