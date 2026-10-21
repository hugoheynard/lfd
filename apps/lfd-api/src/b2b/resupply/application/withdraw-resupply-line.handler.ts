import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ReceiptLineNotFoundError } from "../domain/resupply-receipt-errors.js";
import { WithdrawResupplyLineCommand } from "./withdraw-resupply-line.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/** **Retire un article** de la liste reçue — saisi par erreur. */
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
  ) {}

  async execute(command: WithdrawResupplyLineCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const receipt = await this.receipts.load(command.siteId, command.serviceDay);
      if (receipt === null) {
        throw new ReceiptLineNotFoundError(command.sku);
      }
      receipt.withdraw(command.sku, trace);
      await this.receipts.save(receipt);
    });
  }
}
