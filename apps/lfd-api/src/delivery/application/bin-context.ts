import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { BinRow, DeliveryLoadingReader } from "../domain/ports/delivery-loading.reader.js";
import { type BinContext, namesByOrder, ordersCitedBy } from "./delivery-loading-view.js";

/**
 * Le contexte d'une vue de bacs (lot 4 bis, tranche B) : les noms des
 * commandes que les bacs citent — la leur ET celle de leur moitié partenaire —
 * et où sont leurs arrêts vivants, pour dire « partagé avec … » et « à
 * refaire ». Deux lectures, quel que soit le nombre de bacs.
 */
export async function binContextOf(
  loading: DeliveryLoadingReader,
  orders: DeliveryOrdersReader,
  bins: readonly BinRow[],
  alsoOrderIds: readonly string[] = [],
): Promise<BinContext> {
  const orderIds = [...new Set([...alsoOrderIds, ...ordersCitedBy(bins)])];
  const [facts, places] = await Promise.all([orders.byIds(orderIds), loading.placesOf(orderIds)]);
  return { names: namesByOrder(facts), places };
}
