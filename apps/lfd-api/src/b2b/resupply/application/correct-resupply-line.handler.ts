import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ReceiptLineNotFoundError } from "../domain/resupply-receipt-errors.js";
import { CorrectResupplyLineCommand } from "./correct-resupply-line.command.js";
import { ReceivedStockLowering } from "./received-stock-lowering.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Corrige la quantité reçue** d'un article du réassort sans commande. Une
 * baisse ne descend pas sous le déjà-vendu sur stock (`ReceivedStockLowering`,
 * plan du jour J, lot L2).
 */
@CommandHandler(CorrectResupplyLineCommand)
export class CorrectResupplyLineHandler implements ICommandHandler<
  CorrectResupplyLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lowering: ReceivedStockLowering,
  ) {}

  async execute(command: CorrectResupplyLineCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const article = { siteId: command.siteId, serviceDay: command.serviceDay, sku: command.sku };
    await this.uow.run(() =>
      this.lowering.lower(article, async () => {
        const receipt = await this.receipts.loadUnordered(command.siteId, command.serviceDay);
        if (receipt === null) {
          throw new ReceiptLineNotFoundError(command.sku);
        }
        receipt.correct(command.sku, command.quantity, trace);
        await this.receipts.save(receipt);
      }),
    );
  }
}
