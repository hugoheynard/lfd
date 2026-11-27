import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { OptionGroupHoldersReader } from "../domain/ports/option-group-holders.reader.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";
import { requireOptionGroup } from "./option-group-support.js";

export class RestoreOptionGroupCommand {
  constructor(readonly id: string) {}
}

/**
 * Remet un groupe en service : il se propose de nouveau sur les fiches qui
 * l'activent, réémises après la transaction. Rejoué sur un groupe en
 * service : ni écriture, ni fait, ni réémission.
 */
@CommandHandler(RestoreOptionGroupCommand)
export class RestoreOptionGroupHandler implements ICommandHandler<RestoreOptionGroupCommand, void> {
  constructor(
    private readonly groups: OptionGroupRepository,
    private readonly holders: OptionGroupHoldersReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: RestoreOptionGroupCommand): Promise<void> {
    const restored = await this.uow.run(async () => {
      const group = await requireOptionGroup(this.groups, command.id);
      if (!group.restore()) {
        return false;
      }
      const { name } = group.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.optionGroupRestored,
        subjectType: "option_group",
        subjectId: group.id,
        payload: { subjectLabel: name, name },
      });
      await this.groups.save(group, ticket);
      return true;
    });
    if (restored) {
      await this.reemission.products(await this.holders.productsHolding(command.id));
    }
  }
}
