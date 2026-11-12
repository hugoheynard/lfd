import type { SaleUnit } from "@lfd/money";

import type { GestureIntent } from "../../../platform/intent/gesture-intent.js";
import { FIRST_SHIPMENT_RANK } from "../../../production/channels/packing/index.js";
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
 * La feuille de rang 1 par défaut : les gestes du poste n'adressent encore que
 * la commande — leurs routes ne portent pas de rang, et aucun reliquat n'est
 * inscrit au colisage avant que le commerce n'en crée (plan E7 reliquat, L8).
 *
 * @throws {PackingOrderNotDrawnYetError} la liste à coliser n'est pas arrivée.
 */
export async function lockedSheet(
  sheets: PackingSheetRepository,
  serviceDay: string,
  orderId: string,
  rank: number = FIRST_SHIPMENT_RANK,
): Promise<PackingSheet> {
  const sheet = await sheets.lock(serviceDay, orderId, rank);
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
  released: readonly {
    readonly sku: string;
    readonly quantity: number;
    readonly unit: SaleUnit;
  }[],
): Promise<void> {
  const ordered = [...released].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const { sku, quantity, unit } of ordered) {
    const stock = await stocks.lock(serviceDay, sku);
    stock.release(quantity, unit);
    await stocks.save(stock);
  }
}

/**
 * L'intention d'un mouvement de pièces du poste : un glisser, un retrait ou
 * un déplacement est un DELTA, et un double clic le referait (décision de
 * Hugo du 2026-11-12). Le sujet est la ligne dans son contenant de départ :
 * la même clé sur une autre ligne est refusée (409 nommé).
 */
export function movementIntent(
  gesture: "packing.allocate" | "packing.withdraw" | "packing.transfer",
  command: {
    readonly staffUserId: string;
    readonly intentKey: string;
    readonly orderId: string;
    readonly sku: string;
  },
  containerId: string,
): GestureIntent {
  return {
    actorId: command.staffUserId,
    key: command.intentKey,
    gesture,
    subject: `${command.orderId}/${containerId}/${command.sku}`,
  };
}
