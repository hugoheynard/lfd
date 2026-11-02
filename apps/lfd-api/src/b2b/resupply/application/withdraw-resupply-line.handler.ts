import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ReceiptLineNotFoundError } from "../domain/resupply-receipt-errors.js";
import { WithdrawResupplyLineCommand } from "./withdraw-resupply-line.command.js";
import { ReceivedStockLowering } from "./received-stock-lowering.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Retire un article** du réassort sans commande — saisi par erreur. Refusé
 * si les commandes sur stock en ont déjà pris plus que les autres reçus n'en
 * portent (`ReceivedStockLowering`, plan du jour J, le stock du jour décompté, L2).
 */
@CommandHandler(WithdrawResupplyLineCommand)
export class WithdrawResupplyLineHandler implements ICommandHandler<
  WithdrawResupplyLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lowering: ReceivedStockLowering,
  ) {}

  async execute(command: WithdrawResupplyLineCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const article = { siteId: command.siteId, serviceDay: command.serviceDay, sku: command.sku };
    await this.uow.run(() =>
      this.lowering.lower(article, async () => {
        const receipt = await this.receipts.loadUnordered(command.siteId, command.serviceDay);
        if (receipt === null) {
          throw new ReceiptLineNotFoundError(command.sku);
        }
        receipt.withdraw(command.sku, trace);
        await this.receipts.save(receipt);
      }),
    );
  }
}
