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
 * Les bons de livraison (plan E1, 2026-10-24) tiennent leur commande en
 * `RESTRICT` : ils partent avant elle, leurs lignes avant eux. Même clé, et
 * donc même ordre, pour ce que les gestes d'après l'arrêt du plan écrivent
 * sur une commande (relu dans le schéma le 2026-10-25) : la décision de
 * départ incomplet, les révisions de quantités (A2), la demande de
 * remboursement et le remboursement. Oubliée, la première faisait échouer
 * toute la remise (« Une ressource liée est introuvable », 2026-10-25).
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
    ...(await purgeOrderChildren(tx, orderIds)),
    await tx.deliveryNoteLine.deleteMany({ where: { note: { orderId: { in: orderIds } } } }),
    await tx.deliveryNote.deleteMany({ where: { orderId: { in: orderIds } } }),
  ];
  // Les lignes suivent la commande en cascade.
  const orders = await tx.order.deleteMany({ where: { id: { in: orderIds } } });
  return {
    rows: lines + orders.count + counts.reduce((total, { count }) => total + count, 0),
    orders: orders.count,
  };
}

/** Ce que les gestes d'après l'arrêt écrivent sous une commande, tenu en `RESTRICT`. */
async function purgeOrderChildren(
  tx: PurgeClient,
  orderIds: readonly string[],
): Promise<readonly { readonly count: number }[]> {
  const ofOrders = { orderId: { in: [...orderIds] } };
  return [
    // La décision d'abord : elle tient le manque de son envoi (LB).
    await tx.orderShortfallDecision.deleteMany({ where: ofOrders }),
    await tx.orderShortfall.deleteMany({ where: ofOrders }),
    await tx.orderRevisionEntry.deleteMany({ where: ofOrders }),
    await tx.orderRefund.deleteMany({ where: ofOrders }),
    await tx.orderRefundRequest.deleteMany({ where: ofOrders }),
  ];
}
