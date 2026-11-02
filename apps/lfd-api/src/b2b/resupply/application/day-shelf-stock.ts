import { Injectable } from "@nestjs/common";

import { type EstimatedStockLine, estimateStock } from "../domain/estimated-stock.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ResupplyReceiptReader } from "../domain/resupply-receipt.reader.js";
import { ShelfDrawsReader } from "../domain/shelf-draws.reader.js";

/**
 * **Le reste du jour d'un point, en un seul calcul** (plan du jour J, §11.2,
 * lot L2) : lit les prélèvements des commandes sur stock et les passe, avec
 * les reçus, à `estimateStock`. La Supervision, la réception et le refus
 * d'une baisse de reçu passent tous par ici : deux écrans ne peuvent pas
 * dire deux restes.
 *
 * Lecture seule. Lu sous `ShelfStockLock` quand il sert à décider
 * (`ReceivedStockLowering`) ; sans verrou pour afficher.
 */
@Injectable()
export class DayShelfStock {
  constructor(
    private readonly receipts: ResupplyReceiptReader,
    private readonly draws: ShelfDrawsReader,
  ) {}

  /** Le reste au point, reçus relus. */
  async at(siteId: string, serviceDay: string): Promise<readonly EstimatedStockLine[]> {
    const snapshots = await this.receipts.on(siteId, serviceDay);
    return this.of(
      siteId,
      serviceDay,
      snapshots.map((snapshot) => ResupplyReceipt.restore(snapshot)),
    );
  }

  /** Le reste au point, pour un appelant qui a déjà les reçus de CE point et de CE jour. */
  async of(
    siteId: string,
    serviceDay: string,
    receipts: readonly ResupplyReceipt[],
  ): Promise<readonly EstimatedStockLine[]> {
    return estimateStock(receipts, await this.draws.drawsAt(serviceDay, siteId));
  }
}
