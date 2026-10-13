import type { DeliveryOrderLine, TransferOrderContentsReader } from "../channels/commerce/index.js";
import type { InternalTransfer, ItemContents } from "../domain/entities/internal-transfer.js";

const EMPTY: ReadonlyMap<string, readonly DeliveryOrderLine[]> = new Map();

/**
 * Le contenu de chaque élément de ces transferts, lu au commerce en UNE
 * lecture (décision de Hugo du 2026-10-13 : le manifeste). Un réassort n'a pas
 * encore de lecteur — le concept n'est pas bâti — : son contenu est inconnu,
 * et le manifeste ne l'invente pas.
 */
export async function itemContentsOf(
  reader: TransferOrderContentsReader,
  transfers: readonly InternalTransfer[],
): Promise<ItemContents> {
  const orderIds = transfers.flatMap((transfer) => transfer.orderIds);
  const lines = orderIds.length === 0 ? EMPTY : await reader.contentsOf(orderIds);
  return (item) =>
    item.kind === "order"
      ? lines.get(item.orderId)?.map((line) => ({
          sku: line.sku,
          productName: line.name,
          quantity: line.quantity,
        }))
      : undefined;
}
