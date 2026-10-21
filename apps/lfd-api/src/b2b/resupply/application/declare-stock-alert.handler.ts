import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../domain/resupply-receipt-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { StockAlert } from "../domain/stock-alert.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { DeclareStockAlertCommand } from "./declare-stock-alert.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Déclare une rupture ou un stock faible.** S'il y a déjà une alerte
 * vivante pour cet article à ce point, elle est REDÉCLARÉE (son niveau
 * change) plutôt qu'une seconde ouverte. Le libellé est lu au catalogue
 * publié, jamais pris du client.
 */
@CommandHandler(DeclareStockAlertCommand)
export class DeclareStockAlertHandler implements ICommandHandler<DeclareStockAlertCommand, void> {
  constructor(
    private readonly alerts: StockAlertRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareStockAlertCommand): Promise<void> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const article = await this.catalogue.article(command.sku);
    if (article === null) {
      throw new ResupplyArticleUnknownError(command.sku);
    }
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const live = await this.alerts.liveFor(command.siteId, article.sku);
      if (live !== null) {
        live.redeclare(command.level, trace);
        await this.alerts.save(live);
        return;
      }
      await this.alerts.save(
        StockAlert.declare({
          id: this.ids.next(),
          siteId: command.siteId,
          sku: article.sku,
          label: article.name,
          level: command.level,
          trace,
        }),
      );
    });
  }
}
