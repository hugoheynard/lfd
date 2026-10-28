import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { draftContentOf } from "../domain/bakehouse-resupply-draft-content.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { loadBakehouseDraft } from "./bakehouse-resupply-draft-support.js";
import {
  type BakehouseSendingPorts,
  prepareBakehouseResupply,
  writeBakehouseResupply,
} from "./bakehouse-resupply-sending.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { SendBakehouseResupplyDraftCommand } from "./send-bakehouse-resupply-draft.command.js";

/**
 * **Envoyer un brouillon** (plan `reassort-boutiques/plan-brouillons-du-fournil.md`
 * §3) : ce qui part est ce que l'écran montre. Le réassort naît par le chemin
 * de l'envoi du fournil (`bakehouse-resupply-sending.ts`), puis le brouillon
 * passe `sent` avec son id — dans UNE unité de travail : un refus de l'envoi
 * (heure limite, plan arrêté, article retiré) laisse le brouillon ouvert et
 * intact, et une version périmée n'envoie rien.
 *
 * @sans-journal comme l'envoi du fournil (R1d), dont il emprunte le chemin.
 */
@CommandHandler(SendBakehouseResupplyDraftCommand)
export class SendBakehouseResupplyDraftHandler implements ICommandHandler<
  SendBakehouseResupplyDraftCommand,
  string
> {
  private readonly ports: BakehouseSendingPorts;

  constructor(
    private readonly drafts: BakehouseResupplyDraftRepository,
    resupplies: SiteResupplyRepository,
    catalogue: ResupplyCatalogue,
    sites: ResupplySites,
    cutoff: ResupplyCutoff,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    ids: IdGenerator,
    gate: ResupplyPlanGate,
    private readonly uow: UnitOfWork,
  ) {
    this.ports = { resupplies, catalogue, sites, cutoff, ids, gate };
  }

  async execute(command: SendBakehouseResupplyDraftCommand): Promise<string> {
    const draft = await loadBakehouseDraft(this.drafts, command.draftId);
    // Refusé AVANT de rien lire : un brouillon clos ou périmé n'envoie rien.
    draft.ensureWritable(command.version);
    const content = draftContentOf(command.content);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const prepared = await prepareBakehouseResupply(this.ports, content, trace);
    return this.uow.run(async () => {
      const resupplyId = await writeBakehouseResupply(this.ports, prepared);
      draft.markSent({ content, resupplyId, trace, readVersion: command.version });
      await this.drafts.save(draft);
      return resupplyId;
    });
  }
}
