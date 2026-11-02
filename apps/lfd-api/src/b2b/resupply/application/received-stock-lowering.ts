import { Injectable } from "@nestjs/common";

import type { EstimatedStockLine } from "../domain/estimated-stock.js";
import { ShelfStockAlreadySoldError } from "../domain/resupply-receipt-errors.js";
import { ShelfStockLock } from "../domain/shelf-stock-lock.js";
import { DayShelfStock } from "./day-shelf-stock.js";

/** L'article d'un reçu qu'un geste s'apprête à toucher. */
export interface LoweredArticle {
  readonly siteId: string;
  readonly serviceDay: string;
  readonly sku: string;
}

/**
 * **Toute baisse d'une quantité reçue passe par ici** (plan du jour J, §11.2
 * et §12 bloquant 1, lot L2) : corriger un reçu réceptionné, corriger ou
 * retirer un article du réassort sans commande.
 *
 * Prend `ShelfStockLock`, laisse le geste écrire, relit le reste dans la même
 * transaction, et refuse si l'article est passé sous ce que les commandes sur
 * stock en ont déjà pris. Le refus annule l'écriture avec la transaction.
 *
 * Seule une BAISSE est refusée : un geste qui remonte un reçu sans atteindre
 * le déjà-pris passe — le refuser bloquerait la correction qui répare.
 *
 * ⚠️ À appeler DANS `UnitOfWork.run` : le verrou se relâche au `COMMIT`.
 */
@Injectable()
export class ReceivedStockLowering {
  constructor(
    private readonly lock: ShelfStockLock,
    private readonly stock: DayShelfStock,
  ) {}

  /** @throws {ShelfStockAlreadySoldError} la baisse passerait sous le déjà-vendu. */
  async lower(article: LoweredArticle, change: () => Promise<void>): Promise<void> {
    await this.lock.lock(article.serviceDay, article.siteId);
    const before = await this.lineOf(article);
    await change();
    const after = await this.lineOf(article);
    if (after === null || after.estimatedStock >= 0) {
      return;
    }
    if (after.receivedQuantity < (before?.receivedQuantity ?? 0)) {
      const sold = after.receivedQuantity - after.estimatedStock;
      throw new ShelfStockAlreadySoldError(article.sku, after.label, sold);
    }
  }

  private async lineOf(article: LoweredArticle): Promise<EstimatedStockLine | null> {
    const lines = await this.stock.at(article.siteId, article.serviceDay);
    return lines.find((line) => line.sku === article.sku) ?? null;
  }
}
