import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **Le commerce du scénario** : ses commandes et leurs lignes, les clés de
 * passation de ses acheteurs, les alertes de compte et notifications staff
 * qu'elles ont levées, et le journal `day_change` de ses journées.
 *
 * Les clés de passation ne tiennent leur commande par AUCUNE clé étrangère
 * (la ligne naît avant elle) : sans cette coupe, chaque rechargement en
 * laissait trente-cinq de plus (mesuré le 2026-10-05). Les notifications ne
 * portent la commande que par son numéro, au bout de leur clé d'idempotence
 * (`notification:product.first_order:<numéro>`, relu le 2026-10-05).
 *
 * @returns les lignes supprimées, dont les commandes à part.
 */
export async function purgeCommerce(
  tx: PurgeClient,
  scope: ScenarioScope,
): Promise<{ readonly rows: number; readonly orders: number }> {
  const orderIds = [...scope.orderIds];
  const lines = await tx.orderLine.count({ where: { orderId: { in: orderIds } } });
  const ofOrderNumbers = scope.orderNumbers.map((number) => ({
    idempotencyKey: { endsWith: `:${number}` },
  }));
  const counts = [
    await tx.orderIdempotency.deleteMany({ where: { userId: { in: [...scope.userIds] } } }),
    await tx.accountAlert.deleteMany({ where: { orderId: { in: orderIds } } }),
    await tx.staffNotification.deleteMany({
      where: ofOrderNumbers.length === 0 ? { id: { in: [] } } : { OR: ofOrderNumbers },
    }),
    await tx.orderDayChange.deleteMany({ where: { serviceDay: { in: [...scope.days] } } }),
  ];
  // Les lignes suivent la commande en cascade.
  const orders = await tx.order.deleteMany({ where: { id: { in: orderIds } } });
  return {
    rows: lines + orders.count + counts.reduce((total, { count }) => total + count, 0),
    orders: orders.count,
  };
}
