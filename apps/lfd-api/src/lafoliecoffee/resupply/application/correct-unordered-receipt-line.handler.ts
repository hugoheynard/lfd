import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { CorrectUnorderedReceiptLineCommand } from "./correct-unordered-receipt-line.command.js";
import { ReceivedStockLowering } from "./received-stock-lowering.js";
import { lowerUnorderedReceipt } from "./unordered-receipt-editing.js";

/**
 * **Corrige la quantité reçue** d'un article du réassort sans commande. Une
 * baisse ne descend pas sous le déjà-vendu sur stock (`ReceivedStockLowering`,
 * L2 — `documentation/limites-de-commande/jour-meme-sur-stock.md`).
 */
@CommandHandler(CorrectUnorderedReceiptLineCommand)
export class CorrectUnorderedReceiptLineHandler implements ICommandHandler<
  CorrectUnorderedReceiptLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lowering: ReceivedStockLowering,
  ) {}

  execute(command: CorrectUnorderedReceiptLineCommand): Promise<void> {
    const { receipts, staff, clock, uow, lowering } = this;
    return lowerUnorderedReceipt(
      { receipts, staff, clock, uow, lowering },
      command,
      (receipt, trace) => receipt.correct(command.sku, command.quantity, trace),
    );
  }
}
