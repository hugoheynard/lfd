import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ReceiptNotYetReceivedError } from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { CorrectReceivedResupplyLineCommand } from "./correct-received-resupply-line.command.js";
import { ReceivedStockLowering } from "./received-stock-lowering.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Corrige un écart** sur un réassort réceptionné (bac abîmé, erreur) : le
 * reçu d'une ligne change, l'attendu reste. Avant « Réceptionner », rien
 * n'est reçu, donc rien ne se corrige (409). Comme pour les alertes de stock (R1b), une correction
 * ne lève aucune alerte : seule la réception le fait.
 *
 * Une baisse passe par `ReceivedStockLowering` (plan du jour J, le stock du jour décompté, L2) :
 * elle ne descend pas sous ce que les commandes sur stock ont déjà pris.
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
    private readonly lowering: ReceivedStockLowering,
  ) {}

  async execute(command: CorrectReceivedResupplyLineCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const receipt = await this.receipts.loadForResupply(command.siteId, command.resupplyId);
      if (receipt === null) {
        throw new ReceiptNotYetReceivedError();
      }
      const article = { siteId: command.siteId, serviceDay: receipt.serviceDay, sku: command.sku };
      // Chargé avant le verrou pour en connaître la journée : un reçu changé
      // entre-temps est refusé par `save` (version), il ne s'écrase pas.
      await this.lowering.lower(article, async () => {
        receipt.correct(command.sku, command.quantity, trace);
        await this.receipts.save(receipt);
      });
    });
  }
}
