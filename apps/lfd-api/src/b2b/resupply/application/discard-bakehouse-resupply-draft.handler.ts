import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { loadBakehouseDraft } from "./bakehouse-resupply-draft-support.js";
import { DiscardBakehouseResupplyDraftCommand } from "./discard-bakehouse-resupply-draft.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * « Supprimer le brouillon » : il passe `discarded`, la ligne reste.
 *
 * @sans-journal comme l'envoi du fournil (R1d) : qui l'a supprimé et quand
 * sont figés sur la ligne du brouillon (`closed_*`).
 */
@CommandHandler(DiscardBakehouseResupplyDraftCommand)
export class DiscardBakehouseResupplyDraftHandler implements ICommandHandler<
  DiscardBakehouseResupplyDraftCommand,
  void
> {
  constructor(
    private readonly drafts: BakehouseResupplyDraftRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: DiscardBakehouseResupplyDraftCommand): Promise<void> {
    const draft = await loadBakehouseDraft(this.drafts, command.draftId);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    draft.discard(trace, command.version);
    await this.drafts.save(draft);
  }
}
