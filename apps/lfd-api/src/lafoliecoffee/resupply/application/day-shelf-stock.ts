import { Injectable } from "@nestjs/common";

import { type EstimatedStockLine, estimateStock } from "../domain/estimated-stock.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ResupplyReceiptReader } from "../domain/resupply-receipt.reader.js";
import { ShelfDrawsReader } from "../domain/shelf-draws.reader.js";

/**
 * **Le reste du jour d'un point, en un seul calcul** (le stock du jour
 * décompté, L2 — `documentation/limites-de-commande/jour-meme-sur-stock.md`) : lit les prélèvements des commandes sur stock et les passe, avec
 * les reçus, à `estimateStock`. La Supervision, la réception et le refus
 * d'une baisse de reçu passent tous par ici : deux écrans ne peuvent pas
 * dire deux restes.
 *
 * Lecture seule. Lu sous `ShelfStockLock` quand il sert à décider
 * (`ReceivedStockLowering`, `ShelfCircuit`) ; sans verrou pour afficher
 * (Supervision, réception, boutique — appelants relus le 2026-11-03).
 */
@Injectable()
export class DayShelfStock {
  constructor(
    private readonly receipts: ResupplyReceiptReader,
    private readonly draws: ShelfDrawsReader,
  ) {}

  /** Le reste au point, reçus relus. */
  async at(siteId: string, serviceDay: string): Promise<readonly EstimatedStockLine[]> {
    return this.of(siteId, serviceDay, await this.receiptsAt(siteId, serviceDay));
  }

  /** Les reçus du point ce jour-là, réhydratés — sans les prélèvements. */
  async receiptsAt(siteId: string, serviceDay: string): Promise<readonly ResupplyReceipt[]> {
    const snapshots = await this.receipts.on(siteId, serviceDay);
    return snapshots.map((snapshot) => ResupplyReceipt.restore(snapshot));
  }

  /**
   * Le reste de chaque point listé, pour un appelant qui a déjà les reçus de
   * la journée (tous points) : les prélèvements se lisent en UNE fois pour
   * la journée, pas une par point (audit final, 2026-11-03).
   */
  async allOn(
    serviceDay: string,
    siteIds: readonly string[],
    receipts: readonly ResupplyReceipt[],
  ): Promise<ReadonlyMap<string, readonly EstimatedStockLine[]>> {
    const draws = await this.draws.drawsOn(serviceDay);
    return new Map(
      siteIds.map((siteId) => {
        const own = receipts.filter((receipt) => receipt.siteId === siteId);
        return [siteId, estimateStock(own, draws.get(siteId) ?? [])] as const;
      }),
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
