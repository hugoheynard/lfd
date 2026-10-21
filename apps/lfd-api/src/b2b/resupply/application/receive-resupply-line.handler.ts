import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptLine } from "../domain/resupply-receipt-line.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { ReceiveResupplyLineCommand } from "./receive-resupply-line.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Ajoute un article reçu.** Le libellé est lu au catalogue publié, jamais
 * pris du client : la liste affiche ce que la boutique vend. La réception du
 * jour s'ouvre au premier article.
 */
@CommandHandler(ReceiveResupplyLineCommand)
export class ReceiveResupplyLineHandler implements ICommandHandler<
  ReceiveResupplyLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
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
    const line = ResupplyReceiptLine.of({
      sku: article.sku,
      label: article.name,
      quantity: command.quantity,
    });
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const receipt =
        (await this.receipts.load(command.siteId, command.serviceDay)) ??
        ResupplyReceipt.open({
          id: this.ids.next(),
          siteId: command.siteId,
          serviceDay: command.serviceDay,
        });
      receipt.receive(line, trace);
      await this.receipts.save(receipt);
    });
  }
}
