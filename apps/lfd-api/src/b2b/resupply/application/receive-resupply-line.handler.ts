import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue, resuppliable } from "../domain/resupply-catalogue.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptLine } from "../domain/resupply-receipt-line.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { liftStockAlertOnReceipt } from "./lift-stock-alert-on-receipt.js";
import { ReceiveResupplyLineCommand } from "./receive-resupply-line.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Ajoute un article au réassort sans commande** — la saisie de secours,
 * ligne par ligne (lot R2 : ce qui arrive sans avoir été commandé). Le libellé
 * est lu au catalogue publié, jamais pris du client. Le réassort sans
 * commande du jour s'ouvre au premier article, et compte au stock aussitôt.
 *
 * Depuis le lot R1b (2026-10-21), l'article reçu lève l'alerte de stock
 * vivante du point (rupture, stock faible), dans la même transaction.
 */
@CommandHandler(ReceiveResupplyLineCommand)
export class ReceiveResupplyLineHandler implements ICommandHandler<
  ReceiveResupplyLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly alerts: StockAlertRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReceiveResupplyLineCommand): Promise<void> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const article = await this.catalogue.article(command.sku);
    if (article === null) {
      throw new ResupplyArticleUnknownError(command.sku);
    }
    resuppliable(article);
    const line = ResupplyReceiptLine.unordered({
      sku: article.sku,
      label: article.name,
      quantity: command.quantity,
    });
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const receipt =
        (await this.receipts.loadUnordered(command.siteId, command.serviceDay)) ??
        ResupplyReceipt.openUnordered({
          id: this.ids.next(),
          siteId: command.siteId,
          serviceDay: command.serviceDay,
        });
      receipt.receive(line, trace);
      await this.receipts.save(receipt);
      await liftStockAlertOnReceipt(
        this.alerts,
        { siteId: command.siteId, sku: line.sku, quantity: command.quantity },
        trace,
      );
    });
  }
}
