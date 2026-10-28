import type { SavedBakehouseResupplyDraftResponse } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { BakehouseResupplyDraft } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { ensureSiteExists, savedDraft } from "./bakehouse-resupply-draft-support.js";
import { CreateBakehouseResupplyDraftCommand } from "./create-bakehouse-resupply-draft.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * « Enregistrer comme brouillon » au fournil, la première fois (plan
 * `reassort-boutiques/plan-brouillons-du-fournil.md`). Le point doit
 * exister ; les SKU ne sont pas lus au catalogue — un article retiré se
 * refuse à l'envoi.
 *
 * @sans-journal comme l'envoi du fournil (R1d) : l'auteur et l'instant sont
 * figés sur la ligne du brouillon, et aucune zone du journal ne couvre le
 * réassort (vérifié le 2026-10-28).
 */
@CommandHandler(CreateBakehouseResupplyDraftCommand)
export class CreateBakehouseResupplyDraftHandler implements ICommandHandler<
  CreateBakehouseResupplyDraftCommand,
  SavedBakehouseResupplyDraftResponse
> {
  constructor(
    private readonly drafts: BakehouseResupplyDraftRepository,
    private readonly sites: ResupplySites,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    command: CreateBakehouseResupplyDraftCommand,
  ): Promise<SavedBakehouseResupplyDraftResponse> {
    await ensureSiteExists(this.sites, command.content.siteId);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const draft = BakehouseResupplyDraft.open({
      id: this.ids.next(),
      content: command.content,
      trace,
    });
    return savedDraft(this.drafts, draft);
  }
}
