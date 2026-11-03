import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import type { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ReceiptNotYetReceivedError } from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { CorrectReceivedResupplyLineCommand } from "./correct-received-resupply-line.command.js";
import { ReceivedStockLowering } from "./received-stock-lowering.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Corrige un écart** sur un réassort réceptionné (bac abîmé, erreur) : le
 * reçu d'une ligne change, l'attendu reste. Avant « Réceptionner », rien
 * n'est reçu, donc rien ne se corrige (409). Comme pour les alertes de stock (R1b), une correction
 * ne lève aucune alerte : seule la réception le fait (`liftStockAlertsOnReceipt`
 * n'a que deux appelants, les deux réceptions — vérifié le 2026-11-03).
 *
 * Une baisse passe par `ReceivedStockLowering` (L2 — `documentation/limites-de-commande/jour-meme-sur-stock.md`) :
 * elle ne descend pas sous ce que les commandes sur stock ont déjà pris.
 *
 * **Clé, verrou, chargement** (audit final, 2026-11-03 — comme l'annulation) :
 * le reçu est lu une première fois pour sa journée (immuable), le verrou du
 * stock pris sur elle, et le reçu RECHARGÉ sous lui. Il était corrigé sur la
 * lecture d'avant le verrou : la version le protégeait à l'écriture, mais une
 * correction faite entre-temps par un autre poste faisait échouer celle-ci
 * (409) au lieu de s'appliquer sur l'état que le verrou garde.
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
      const day = (await this.received(command)).serviceDay;
      const article = { siteId: command.siteId, serviceDay: day, sku: command.sku };
      await this.lowering.lower(article, async () => {
        const receipt = await this.received(command);
        receipt.correct(command.sku, command.quantity, trace);
        await this.receipts.save(receipt);
      });
    });
  }

  private async received(command: CorrectReceivedResupplyLineCommand): Promise<ResupplyReceipt> {
    const receipt = await this.receipts.loadForResupply(command.siteId, command.resupplyId);
    if (receipt === null) {
      throw new ReceiptNotYetReceivedError();
    }
    return receipt;
  }
}
