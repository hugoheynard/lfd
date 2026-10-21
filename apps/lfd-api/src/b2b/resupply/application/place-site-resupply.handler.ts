import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../domain/resupply-receipt-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupply } from "../domain/site-resupply.js";
import { SiteResupplyLine } from "../domain/site-resupply-line.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { PlaceSiteResupplyCommand } from "./place-site-resupply.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Passe un réassort.** Le brouillon se compose ici, d'un geste : chaque
 * libellé est lu au catalogue publié (jamais pris du client), puis
 * `place()` oppose l'heure limite que le port rend pour sa journée.
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
    const resupply = SiteResupply.draft({
      id: this.ids.next(),
      siteId: command.siteId,
      target: command.target,
      at: trace.at,
    });
    for (const requested of command.lines) {
      const article = await this.catalogue.article(requested.sku);
      if (article === null) {
        throw new ResupplyArticleUnknownError(requested.sku);
      }
      resupply.addLine(
        SiteResupplyLine.of({
          sku: article.sku,
          label: article.name,
          quantity: requested.quantity,
        }),
      );
    }
    resupply.place(trace, await this.cutoff.deadlineFor(resupply.serviceDay));
    await this.resupplies.save(resupply);
    return resupply.id;
  }
}
