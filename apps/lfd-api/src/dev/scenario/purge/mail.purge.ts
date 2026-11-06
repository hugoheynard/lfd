import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * Le morceau de clé d'idempotence qui désigne une commande : les e-mails d'une
 * commande portent `order.placed:<id>` ou `order.ready:<id>[suffixe de rang]`
 * (`b2b/orders/application/handlers/send-order-*-mail.handler.ts`, vérifié le
 * 2026-11-06). Un identifiant de commande est un cuid : le morceau ne peut
 * désigner une autre commande.
 */
export function mailKeyFragment(orderId: string): string {
  return `:${orderId}`;
}

/**
 * **Le suivi des e-mails du scénario** (`mail.mail_request`) : les demandes
 * dont la clé d'idempotence nomme une de ses commandes.
 *
 * Les commandes du scénario changent d'identifiant à chaque rechargement :
 * leurs demandes restaient, et le suivi grossissait de 146 lignes par tour
 * (mesuré le 2026-11-06, `dev-scenario-stability`). Aucune clé étrangère ne
 * tient ces lignes ; les faits `mail.requested` qui leur correspondent partent
 * avec la boîte d'envoi (`outbox.purge.ts`).
 */
export async function purgeMailRequests(tx: PurgeClient, scope: ScenarioScope): Promise<number> {
  if (scope.orderIds.length === 0) {
    return 0;
  }
  const removed = await tx.mailRequest.deleteMany({
    where: {
      OR: scope.orderIds.map((id) => ({ idempotencyKey: { contains: mailKeyFragment(id) } })),
    },
  });
  return removed.count;
}
