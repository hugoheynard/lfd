import type { DeliveryOrderLine, TransferOrderContentsReader } from "../channels/commerce/index.js";
import type { InternalTransfer, ItemContents } from "../domain/entities/internal-transfer.js";
import type { ManifestLine } from "../domain/services/transfer-manifest.js";
import type { TransferResupplyContents } from "./transfer-resupply-contents.js";

const EMPTY_ORDERS: ReadonlyMap<string, readonly DeliveryOrderLine[]> = new Map();
const EMPTY_RESUPPLIES: ReadonlyMap<string, readonly ManifestLine[]> = new Map();

/**
 * Le contenu de chaque élément de ces transferts (décision de Hugo du
 * 2026-10-13 : le manifeste) : une commande, lue au commerce en UNE lecture ;
 * un réassort (lot R3c), sa copie figée à l'arrêt — l'emballé si la fiche du
 * colisage est close, sinon le demandé (`TransferResupplyContents`). Un
 * élément introuvable a un contenu inconnu, et le manifeste ne l'invente pas.
 */
export async function itemContentsOf(
  reader: TransferOrderContentsReader,
  resupplies: TransferResupplyContents,
  transfers: readonly InternalTransfer[],
): Promise<ItemContents> {
  const orderIds = transfers.flatMap((transfer) => transfer.orderIds);
  const hasResupplies = transfers.some((transfer) => transfer.resupplyIds.length > 0);
  const [lines, resupplyLines] = await Promise.all([
    orderIds.length === 0 ? EMPTY_ORDERS : reader.contentsOf(orderIds),
    hasResupplies ? resupplies.linesOf(transfers) : EMPTY_RESUPPLIES,
  ]);
  return (item) =>
    item.kind === "order"
      ? lines.get(item.orderId)?.map((line) => ({
          sku: line.sku,
          productName: line.name,
          quantity: line.quantity,
        }))
      : resupplyLines.get(item.resupplyId);
}
