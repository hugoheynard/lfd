import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ReceiptNotYetReceivedError } from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { CorrectReceivedResupplyLineCommand } from "./correct-received-resupply-line.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Corrige un écart** sur un réassort réceptionné (bac abîmé, erreur) : le
 * reçu d'une ligne change, l'attendu reste. Avant « Réceptionner », rien
 * n'est reçu, donc rien ne se corrige (409). Comme en R1b, une correction
 * ne lève aucune alerte : seule la réception le fait.
 */
@CommandHandler(CorrectReceivedResupplyLineCommand)
export class CorrectReceivedResupplyLineHandler implements ICommandHandler<
  CorrectReceivedResupplyLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectReceivedResupplyLineCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const receipt = await this.receipts.loadForResupply(command.siteId, command.resupplyId);
      if (receipt === null) {
        throw new ReceiptNotYetReceivedError();
      }
      receipt.correct(command.sku, command.quantity, trace);
      await this.receipts.save(receipt);
    });
  }
}
