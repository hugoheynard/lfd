import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { serviceDayFor, SiteResupply } from "../domain/site-resupply.js";
import type { SiteResupplyLine } from "../domain/site-resupply-line.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SendBakehouseResupplyCommand } from "./send-bakehouse-resupply.command.js";
import { catalogueLine } from "./site-resupply-draft.js";

/**
 * **« Je t'envoie ça »** — le fournil envoie un réassort à un point (lot
 * R1d, Hugo 2026-10-21 : « si le comptoir demande au téléphone, le fournil
 * peut entrer la demande »). Un réassort À PART, d'origine `bakehouse`, créé
 * et envoyé d'un geste : il n'ouvre ni ne touche la demande en cours du
 * comptoir, et le port n'en est jamais consulté. Les règles d'envoi sont
 * celles du comptoir — au moins une ligne, libellés lus au catalogue publié,
 * l'heure limite de sa journée pour « pour demain » si le réassort y est
 * soumis.
 */
@CommandHandler(SendBakehouseResupplyCommand)
export class SendBakehouseResupplyHandler implements ICommandHandler<
  SendBakehouseResupplyCommand,
  string
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly cutoff: ResupplyCutoff,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: SendBakehouseResupplyCommand): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const lines: SiteResupplyLine[] = [];
    for (const requested of command.lines) {
      lines.push(await catalogueLine(this.catalogue, requested));
    }
    const serviceDay = serviceDayFor(command.target, trace.at);
    const resupply = SiteResupply.sentByBakehouse({
      id: this.ids.next(),
      siteId: command.siteId,
      target: command.target,
      lines,
      trace,
      deadline: await this.cutoff.deadlineFor(serviceDay),
    });
    await this.resupplies.save(resupply);
    return resupply.id;
  }
}
