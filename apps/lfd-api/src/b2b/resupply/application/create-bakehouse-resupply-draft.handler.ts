import type { SavedBakehouseResupplyDraftResponse } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { BakehouseResupplyDraft } from "../domain/bakehouse-resupply-draft.js";
import {
  BakehouseResupplyDraftAlreadyWrittenError,
  BakehouseResupplyDraftKeyTakenError,
} from "../domain/bakehouse-resupply-draft-errors.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { ensureSiteExists, savedDraft } from "./bakehouse-resupply-draft-support.js";
import { CreateBakehouseResupplyDraftCommand } from "./create-bakehouse-resupply-draft.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * « Enregistrer comme brouillon » au fournil, la première fois (plan
 * `reassort-boutiques/commander.md`). Le point doit
 * exister ; les SKU ne sont pas lus au catalogue — un article retiré se
 * refuse à l'envoi.
 *
 * Un enregistrement, une fois (C-C, audit du 2026-11-02 — deux clics
 * faisaient deux brouillons) : la clé de l'écran est l'identifiant du
 * brouillon. Déjà écrite pour ce point, le brouillon écrit est rendu tel
 * qu'il est, y compris quand deux enregistrements se croisent (le second bute
 * sur la clé primaire, puis relit). Prise par le brouillon d'un autre point,
 * elle est refusée en le nommant.
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
  ) {}

  async execute(
    command: CreateBakehouseResupplyDraftCommand,
  ): Promise<SavedBakehouseResupplyDraftResponse> {
    await ensureSiteExists(this.sites, command.content.siteId);
    const replayed = await this.alreadyWritten(command);
    if (replayed !== null) {
      return replayed;
    }
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const draft = BakehouseResupplyDraft.open({ id: command.key, content: command.content, trace });
    try {
      return await savedDraft(this.drafts, draft);
    } catch (error) {
      if (!(error instanceof BakehouseResupplyDraftAlreadyWrittenError)) {
        throw error;
      }
      const raced = await this.alreadyWritten(command);
      if (raced === null) {
        throw error;
      }
      return raced;
    }
  }

  /** Le brouillon déjà écrit sous cette clé, pour ce point ; une clé d'un autre point est refusée. */
  private async alreadyWritten(
    command: CreateBakehouseResupplyDraftCommand,
  ): Promise<SavedBakehouseResupplyDraftResponse | null> {
    const existing = await this.drafts.load(command.key);
    if (existing === null) {
      return null;
    }
    if (existing.content.siteId !== command.content.siteId) {
      throw new BakehouseResupplyDraftKeyTakenError(command.key);
    }
    return { id: existing.id, version: existing.version };
  }
}
