import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ReceivedStockLowering } from "./received-stock-lowering.js";
import { lowerUnorderedReceipt } from "./unordered-receipt-editing.js";
import { WithdrawUnorderedReceiptLineCommand } from "./withdraw-unordered-receipt-line.command.js";

/**
 * **Retire un article** du réassort sans commande — saisi par erreur. Refusé
 * si les commandes sur stock en ont déjà pris plus que les autres reçus n'en
 * portent (`ReceivedStockLowering`, L2 —
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`).
 */
@CommandHandler(WithdrawUnorderedReceiptLineCommand)
export class WithdrawUnorderedReceiptLineHandler implements ICommandHandler<
  WithdrawUnorderedReceiptLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lowering: ReceivedStockLowering,
  ) {}

  execute(command: WithdrawUnorderedReceiptLineCommand): Promise<void> {
    const { receipts, staff, clock, uow, lowering } = this;
    return lowerUnorderedReceipt(
      { receipts, staff, clock, uow, lowering },
      command,
      (receipt, trace) => receipt.withdraw(command.sku, trace),
    );
  }
}
