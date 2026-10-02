import type {
  DeliveryOrderRef,
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
} from "../channels/commerce/index.js";
import type { BroughtBackOrdersReader } from "../domain/ports/brought-back-orders.reader.js";

/**
 * **Les commandes rapportées à replacer** (`decisions-par-defaut-2026-10-02.md`,
 * § 4, lot RL1) : rapportées, replacées dans aucune tournée depuis — et, relu
 * par le commerce au même moment, ni annulées, ni passées en retrait au
 * comptoir, ni déjà retirées. Ce qui ne se replace pas ne s'affiche pas.
 */
export async function ordersToReplace(
  broughtBack: BroughtBackOrdersReader,
  orders: DeliveryOrdersReader,
  states: DeliveryOrderStatesReader,
): Promise<readonly DeliveryOrderRef[]> {
  const rows = await broughtBack.awaitingPlacement();
  const ids = rows.map((row) => row.orderId);
  if (ids.length === 0) {
    return [];
  }
  const [facts, known] = await Promise.all([orders.byIds(ids), states.statesOf(ids)]);
  const open = new Set(known.filter((row) => row.state === "open").map((row) => row.orderId));
  const byId = new Map(facts.map((order) => [order.orderId, order]));
  return ids.flatMap((orderId) => {
    const order = byId.get(orderId);
    const replaceable =
      order !== undefined && order.status === "active" && order.delivery && open.has(orderId);
    return replaceable ? [{ orderId, reference: order.reference, status: order.status }] : [];
  });
}
