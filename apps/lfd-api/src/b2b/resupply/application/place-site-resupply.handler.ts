import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { PlaceSiteResupplyCommand } from "./place-site-resupply.command.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { addArticle, currentDraft } from "./site-resupply-draft.js";

/**
 * **Passe un réassort d'un geste** — le bouton « Lancer un réassort au plus
 * tôt » du fournil (R1b). Depuis R1c, il passe par la demande en cours : ses
 * lignes s'ajoutent à celle de la visée (ouverte au besoin, quantités
 * additionnées), puis la demande ENTIÈRE part, avec ce que le comptoir y
 * avait déjà mis — un seul réassort « au plus tôt » à la fois, jamais deux
 * demandes parallèles pour la même visée.
 */
@CommandHandler(PlaceSiteResupplyCommand)
export class PlaceSiteResupplyHandler implements ICommandHandler<PlaceSiteResupplyCommand, string> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly cutoff: ResupplyCutoff,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: PlaceSiteResupplyCommand): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const draft = await currentDraft(this.resupplies, this.ids, {
      siteId: command.siteId,
      target: command.target,
      at: trace.at,
    });
    for (const requested of command.lines) {
      await addArticle(this.catalogue, draft, requested);
    }
    draft.place(trace, await this.cutoff.deadlineFor(draft.serviceDay));
    await this.resupplies.save(draft);
    return draft.id;
  }
}
