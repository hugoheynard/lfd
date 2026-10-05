import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **Les faits d'outbox du scénario**, et leurs livraisons : tout fait dont la
 * charge nomme une journée du scénario (`serviceDay`) ou une de ses commandes
 * (`orderId`).
 *
 * 🔴 C'est ce qui rend le scénario rejouable le même jour (2026-10-05) : les
 * clés de ces faits sont DÉTERMINISTES (`…handed_to_packing:mark-<jour>-…`), et
 * un fait resté du passage précédent absorbait le suivant par
 * `ON CONFLICT DO NOTHING`. Le premier correctif (`8fc4b12`) ne visait que cinq
 * types de faits de journée ; ceux d'une commande (`packing.order_packed`,
 * `handover.handed_over`, `order.fulfilled`) restaient, vingt et un par
 * rechargement (mesuré le 2026-10-05).
 *
 * Les livraisons d'abord : leur clé tient le message.
 */
export async function purgeOutbox(tx: PurgeClient, scope: ScenarioScope): Promise<number> {
  const message = {
    OR: [
      ...scope.days.map((day) => ({ payload: { path: ["serviceDay"], equals: day } })),
      ...scope.orderIds.map((id) => ({ payload: { path: ["orderId"], equals: id } })),
    ],
  };
  if (message.OR.length === 0) {
    return 0;
  }
  const deliveries = await tx.outboxDelivery.deleteMany({ where: { message } });
  const messages = await tx.outboxMessage.deleteMany({ where: message });
  return deliveries.count + messages.count;
}
