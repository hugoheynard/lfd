import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackedResuppliesReader } from "../../../packing/channels/commerce/index.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import type { SiteResupply } from "../domain/site-resupply.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { liftStockAlertsOnReceipt } from "./lift-stock-alert-on-receipt.js";
import { ReceiveSiteResupplyCommand } from "./receive-site-resupply.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **« Réceptionner »** (lot R2) : le comptoir atteste, d'un geste, que le
 * réassort est arrivé. Le reçu naît attendu de la quantité DEMANDÉE, puis
 * l'attendu devient le reçu ; le stock du jour monte à cet instant, jamais à
 * l'envoi. Un écart se corrige ensuite, ligne par ligne.
 *
 * L'attendu est l'emballé au colisage s'il est connu (fiche close, lot R3b),
 * sinon le demandé — lu AVANT l'unité de travail, comme l'auteur : une
 * lecture d'un autre bloc ne se fait pas sous verrou. Le compte du comptoir
 * fait foi (décision C) : un emballé connu APRÈS la réception ne change rien.
 *
 * Seul un réassort envoyé et non annulé se réceptionne. Un second
 * « Réceptionner » est refusé (409), y compris en course entre deux postes.
 * Chaque article reçu (> 0) lève l'alerte de stock vivante du point, dans la
 * même transaction (lot R1b) — lue en une requête pour tout le reçu.
 *
 * ## La réception passe par l'agrégat (G1, audit du 2026-11-02)
 *
 * Le réassort est chargé, `assertReceivable` le laisse passer, et il est
 * SAUVÉ sous sa version AVANT le reçu : sa version avance. L'annulation lit
 * la réception puis sauve sous la version qu'elle a lue ; sans cette
 * écriture, une annulation et une réception concurrentes passaient toutes
 * les deux, et le réassort finissait annulé ET réceptionné. Désormais la
 * seconde des deux échoue à l'écriture (`SiteResupplyChangedMeanwhileError`,
 * 409) — de même pour l'arrivée par transfert.
 */
@CommandHandler(ReceiveSiteResupplyCommand)
export class ReceiveSiteResupplyHandler implements ICommandHandler<
  ReceiveSiteResupplyCommand,
  void
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receipts: ResupplyReceiptRepository,
    private readonly alerts: StockAlertRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly packed: PackedResuppliesReader,
  ) {}

  async execute(command: ReceiveSiteResupplyCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const packed =
      (await this.packed.packedOf([command.resupplyId])).get(command.resupplyId) ?? null;
    await this.uow.run(async () => {
      const resupply = await this.receivable(command.siteId, command.resupplyId);
      await this.resupplies.save(resupply);
      const receipt =
        (await this.receipts.loadForResupply(command.siteId, resupply.id)) ??
        ResupplyReceipt.expecting(this.ids.next(), resupply, packed);
      receipt.receiveAll(trace);
      await this.receipts.save(receipt);
      const received = receipt.lines.map((line) => ({
        sku: line.sku,
        quantity: line.receivedQuantity ?? 0,
      }));
      await liftStockAlertsOnReceipt(this.alerts, command.siteId, received, trace);
    });
  }

  private async receivable(siteId: string, resupplyId: string): Promise<SiteResupply> {
    const resupply = await this.resupplies.load(siteId, resupplyId);
    if (resupply === null) {
      throw new SiteResupplyNotFoundError(resupplyId);
    }
    resupply.assertReceivable();
    return resupply;
  }
}
