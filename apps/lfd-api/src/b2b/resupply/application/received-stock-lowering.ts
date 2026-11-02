import { saleQuantity } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import { type EstimatedStockLine, estimateStock, stockKeyOf } from "../domain/estimated-stock.js";
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
 * et §12 bloquant 1, le stock du jour décompté (L2)) : corriger un reçu réceptionné, corriger ou
 * retirer un article du réassort sans commande.
 *
 * Prend `ShelfStockLock`, laisse le geste écrire, relit le reste dans la même
 * transaction, et refuse si l'article est passé sous ce que les commandes sur
 * stock en ont déjà pris. Le refus annule l'écriture avec la transaction.
 *
 * Le compte se fait par unité (L2b-1) : des grammes ne se comparent qu'à
 * des grammes, et le refus dit l'unité (« 1,25 kg … déjà vendus »).
 *
 * Seule une BAISSE est refusée : un geste qui remonte un reçu sans atteindre
 * le déjà-pris passe — le refuser bloquerait la correction qui répare.
 *
 * Avant le geste, seul le REÇU compte : il se lit sans les prélèvements.
 * Le reste entier (prélèvements compris) ne se calcule qu'une fois, après —
 * il se calculait deux fois (M3, audit du 2026-11-02).
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
    const received = estimateStock(
      await this.stock.receiptsAt(article.siteId, article.serviceDay),
      [],
    );
    const before = linesOf(article, received);
    await change();
    const remaining = await this.stock.at(article.siteId, article.serviceDay);
    for (const after of linesOf(article, remaining).values()) {
      if (after.estimatedStock >= 0) {
        continue;
      }
      const key = stockKeyOf(after.sku, after.saleUnit);
      if (after.receivedQuantity < (before.get(key)?.receivedQuantity ?? 0)) {
        const sold = saleQuantity(after.receivedQuantity - after.estimatedStock, after.saleUnit);
        throw new ShelfStockAlreadySoldError(article.sku, after.label, sold);
      }
    }
  }
}

/** Les comptes de l'article, une entrée par unité (L2b-1) — jamais sommées. */
function linesOf(
  article: LoweredArticle,
  lines: readonly EstimatedStockLine[],
): ReadonlyMap<string, EstimatedStockLine> {
  return new Map(
    lines
      .filter((line) => line.sku === article.sku)
      .map((line) => [stockKeyOf(line.sku, line.saleUnit), line] as const),
  );
}
