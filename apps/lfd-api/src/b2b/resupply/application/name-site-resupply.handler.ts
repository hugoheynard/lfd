import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { NameSiteResupplyCommand } from "./name-site-resupply.command.js";
import { currentDraft } from "./site-resupply-draft.js";

/**
 * **Nomme la demande en cours** (lot R1g, Hugo 2026-10-21 : « vitrine du
 * matin »). La demande de la visée est ouverte si aucune ne l'est, comme
 * pour un ajout : on peut nommer avant le premier article. Sans version
 * attendue — le dernier nom posé l'emporte, et il ne touche pas aux lignes ;
 * une course réelle reste refusée par le verrou.
 */
@CommandHandler(NameSiteResupplyCommand)
export class NameSiteResupplyHandler implements ICommandHandler<NameSiteResupplyCommand, string> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly sites: ResupplySites,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: NameSiteResupplyCommand): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const draft = await currentDraft(this.resupplies, this.ids, {
      siteId: command.siteId,
      target: command.target,
      at: this.clock.now(),
    });
    draft.rename(command.name);
    await this.resupplies.save(draft);
    return draft.id;
  }
}
