import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { OptionGroupPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogReemission } from "../../../shared/catalog-reemission.js";
import { OptionGroupHoldersReader } from "../domain/ports/option-group-holders.reader.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";
import { groupInputOf, journalStateOf, requireOptionGroup } from "./option-group-support.js";

export class UpdateOptionGroupCommand {
  constructor(
    readonly id: string,
    readonly payload: OptionGroupPayload,
  ) {}
}

/**
 * Révise un groupe d'un bloc : son nom et ses choix en service. Un choix
 * retiré de la liste s'archive (`OptionGroup.revise`) ; les commandes passées
 * gardent leur instantané.
 *
 * Les fiches qui l'activent sont réémises APRÈS la transaction, une à une :
 * leur fait porte les choix du groupe. Rejoué à l'identique : ni écriture, ni
 * fait, ni réémission.
 */
@CommandHandler(UpdateOptionGroupCommand)
export class UpdateOptionGroupHandler implements ICommandHandler<UpdateOptionGroupCommand, void> {
  constructor(
    private readonly groups: OptionGroupRepository,
    private readonly holders: OptionGroupHoldersReader,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: UpdateOptionGroupCommand): Promise<void> {
    const revised = await this.uow.run(async () => {
      const group = await requireOptionGroup(this.groups, command.id);
      if (!group.revise(groupInputOf(command.payload), this.clock.now())) {
        return false;
      }
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.optionGroupRevised,
        subjectType: "option_group",
        subjectId: group.id,
        payload: journalStateOf(group),
      });
      await this.groups.save(group, ticket);
      return true;
    });
    if (revised) {
      await this.reemission.products(await this.holders.productsHolding(command.id));
    }
  }
}
