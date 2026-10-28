import type { SavedBakehouseResupplyDraftResponse } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import {
  ensureSiteExists,
  loadBakehouseDraft,
  savedDraft,
} from "./bakehouse-resupply-draft-support.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SaveBakehouseResupplyDraftCommand } from "./save-bakehouse-resupply-draft.command.js";

/**
 * Réécrire un brouillon repris : le contenu entier remplace le précédent,
 * sous la version lue (409 si un autre poste l'a écrit, ou s'il est clos).
 *
 * @sans-journal comme l'envoi du fournil (R1d) : l'auteur et l'instant du
 * dernier enregistrement sont figés sur la ligne du brouillon.
 */
@CommandHandler(SaveBakehouseResupplyDraftCommand)
export class SaveBakehouseResupplyDraftHandler implements ICommandHandler<
  SaveBakehouseResupplyDraftCommand,
  SavedBakehouseResupplyDraftResponse
> {
  constructor(
    private readonly drafts: BakehouseResupplyDraftRepository,
    private readonly sites: ResupplySites,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: SaveBakehouseResupplyDraftCommand,
  ): Promise<SavedBakehouseResupplyDraftResponse> {
    const draft = await loadBakehouseDraft(this.drafts, command.draftId);
    await ensureSiteExists(this.sites, command.content.siteId);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    draft.save(command.content, trace, command.version);
    return savedDraft(this.drafts, draft);
  }
}
