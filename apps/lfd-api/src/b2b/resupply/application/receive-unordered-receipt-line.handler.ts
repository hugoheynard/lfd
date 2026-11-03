import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import {
  ResupplyArticleUnknownError,
  ResupplyReceiptChangedMeanwhileError,
} from "../domain/resupply-receipt-errors.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";
import { ResupplySiteUnknownError } from "../domain/resupply-site-errors.js";
import { ResupplyReceiptLine } from "../domain/resupply-receipt-line.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { liftStockAlertsOnReceipt } from "./lift-stock-alert-on-receipt.js";
import { ReceiveUnorderedReceiptLineCommand } from "./receive-unordered-receipt-line.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Ajoute un article au réassort sans commande** — la saisie de secours,
 * ligne par ligne (la réception en un geste, R2 : ce qui arrive sans avoir été commandé). Le
 * libellé est lu au catalogue publié, jamais pris du client. Le réassort sans
 * commande du jour s'ouvre au premier article, et compte au stock aussitôt.
 *
 * Depuis le 2026-10-21 (R1b), l'article reçu lève l'alerte de stock
 * vivante du point (rupture, stock faible), dans la même transaction.
 *
 * Aujourd'hui seulement (E1, 2026-11-03) : l'agrégat refuse une autre
 * journée que celle de l'horloge du serveur, à l'heure de Paris.
 *
 * **Un double clic ne fait pas d'erreur** (E2, 2026-11-03 — la politique
 * de l'envoi du comptoir) : le même article à la même quantité, déjà sur la
 * liste, rend succès sans rien écrire ni lever. Deux clics qui se croisent :
 * le second bute sur la version (ou sur l'index du réassort sans commande du
 * jour), et le reçu est relu HORS de la transaction défaite — si l'article y
 * est à la même quantité, c'était le même geste.
 */
@CommandHandler(ReceiveUnorderedReceiptLineCommand)
export class ReceiveUnorderedReceiptLineHandler implements ICommandHandler<
  ReceiveUnorderedReceiptLineCommand,
  void
> {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly alerts: StockAlertRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReceiveUnorderedReceiptLineCommand): Promise<void> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const article = await this.catalogue.article(command.sku);
    if (article === null) {
      throw new ResupplyArticleUnknownError(command.sku);
    }
    // L'unité se fige ici, lue au catalogue (L2b-1) : au poids, des grammes.
    const line = ResupplyReceiptLine.unordered({
      sku: article.sku,
      label: article.name,
      quantity: command.quantity,
      saleUnit: article.saleUnit,
    });
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    try {
      await this.uow.run(() => this.receive(command, line, trace));
    } catch (error) {
      if (!(error instanceof ResupplyReceiptChangedMeanwhileError)) {
        throw error;
      }
      if (!(await this.alreadyReceived(command, line))) {
        throw error;
      }
    }
  }

  private async receive(
    command: ReceiveUnorderedReceiptLineCommand,
    line: ResupplyReceiptLine,
    trace: ResupplyTrace,
  ): Promise<void> {
    const receipt =
      (await this.receipts.loadUnordered(command.siteId, command.serviceDay)) ??
      ResupplyReceipt.openUnordered({
        id: this.ids.next(),
        siteId: command.siteId,
        serviceDay: command.serviceDay,
      });
    if (!receipt.receive(line, trace)) {
      return;
    }
    await this.receipts.save(receipt);
    const received = [{ sku: line.sku, quantity: command.quantity }];
    await liftStockAlertsOnReceipt(this.alerts, command.siteId, received, trace);
  }

  /** Le même article, à la même quantité, déjà écrit par le clic qui a gagné. */
  private async alreadyReceived(
    command: ReceiveUnorderedReceiptLineCommand,
    line: ResupplyReceiptLine,
  ): Promise<boolean> {
    const receipt = await this.receipts.loadUnordered(command.siteId, command.serviceDay);
    return receipt?.holds(line) ?? false;
  }
}
