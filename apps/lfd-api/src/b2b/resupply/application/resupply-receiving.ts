import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import type { PackedResupplyLines } from "../../../packing/channels/commerce/index.js";
import { ResupplyReceipt, type ResupplyReceiptTrace } from "../domain/resupply-receipt.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import type { SiteResupply } from "../domain/site-resupply.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { liftStockAlertsOnReceipt } from "./lift-stock-alert-on-receipt.js";

/**
 * **Le reçu d'un réassort attesté d'un geste, et ce qu'il lève** — le reçu
 * (relu, ou né attendu de l'emballé sinon du demandé) reçu en entier, puis
 * les alertes de stock vivantes des articles reçus. Sorti de
 * `ReceiveSiteResupplyHandler` pour qu'il ne porte plus huit dépendances
 * (audit du réassort, 2026-11-02) ; à appeler dans l'unité de travail de
 * l'appelant, APRÈS que le réassort a été sauvé sous sa version.
 */
@Injectable()
export class ResupplyReceiving {
  constructor(
    private readonly receipts: ResupplyReceiptRepository,
    private readonly alerts: StockAlertRepository,
    private readonly ids: IdGenerator,
  ) {}

  async receiveAll(
    resupply: SiteResupply,
    packed: PackedResupplyLines | null,
    trace: ResupplyReceiptTrace,
  ): Promise<void> {
    const receipt =
      (await this.receipts.loadForResupply(resupply.siteId, resupply.id)) ??
      ResupplyReceipt.expecting(this.ids.next(), resupply, packed);
    receipt.receiveAll(trace);
    await this.receipts.save(receipt);
    const received = receipt.lines.map((line) => ({
      sku: line.sku,
      quantity: line.receivedQuantity ?? 0,
    }));
    await liftStockAlertsOnReceipt(this.alerts, resupply.siteId, received, trace);
  }
}
