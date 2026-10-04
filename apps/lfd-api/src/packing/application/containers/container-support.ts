import type { PackingSheet } from "../../domain/entities/packing-sheet.js";
import { PackingOrderNotDrawnYetError } from "../../domain/errors/packing-station-errors.js";
import type { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import type { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import type { CitedPackingOrder } from "../../domain/events/packing-container.events.js";

/**
 * Les gardes que les gestes de la colonne Contenants partagent (K2b).
 */

/**
 * Le bac de la commande, SOUS VERROU — dans l'unité de travail de l'appelant.
 *
 * @throws {PackingOrderNotDrawnYetError} la liste à coliser n'est pas arrivée.
 */
export async function lockedSheet(
  sheets: PackingSheetRepository,
  serviceDay: string,
  orderId: string,
): Promise<PackingSheet> {
  const sheet = await sheets.lock(serviceDay, orderId);
  if (sheet === null) {
    throw new PackingOrderNotDrawnYetError(orderId);
  }
  return sheet;
}

/** La commande citée au journal : son id et son numéro. */
export function citedOrderOf(sheet: PackingSheet): CitedPackingOrder {
  return { id: sheet.orderId, name: sheet.reference };
}

/**
 * Rend des pièces à la réserve, article par article, dans l'ordre des SKU —
 * l'ordre des verrous est le même pour tous les gestes (bac, puis réserve).
 */
export async function releaseToStock(
  stocks: PackingStockRepository,
  serviceDay: string,
  released: readonly { readonly sku: string; readonly quantity: number }[],
): Promise<void> {
  const ordered = [...released].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const { sku, quantity } of ordered) {
    const stock = await stocks.lock(serviceDay, sku);
    stock.release(quantity);
    await stocks.save(stock);
  }
}
