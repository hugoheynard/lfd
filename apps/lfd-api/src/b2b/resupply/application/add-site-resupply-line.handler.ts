import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { AddSiteResupplyLineCommand } from "./add-site-resupply-line.command.js";
import { addArticle, currentDraft } from "./site-resupply-draft.js";

/**
 * **Ajoute un article à la demande en cours** (lot R1c). La demande de la
 * visée est ouverte si aucune ne l'est — après un envoi, le prochain ajout
 * en ouvre une nouvelle ; un article déjà présent voit sa quantité
 * s'additionner. Sans version attendue : deux ajouts se cumulent, et une
 * course réelle (deux postes, même instant) est refusée par le verrou.
 */
@CommandHandler(AddSiteResupplyLineCommand)
export class AddSiteResupplyLineHandler implements ICommandHandler<
  AddSiteResupplyLineCommand,
  string
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: AddSiteResupplyLineCommand): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const draft = await currentDraft(this.resupplies, this.ids, {
      siteId: command.siteId,
      target: command.target,
      at: this.clock.now(),
    });
    await addArticle(this.catalogue, draft, command);
    await this.resupplies.save(draft);
    return draft.id;
  }
}
