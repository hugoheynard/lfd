import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * Le type de sujet sous lequel `card-payment` range les paiements d'une
 * commande — 🔴 une valeur écrite en base (`card_payment.payment.subject_type`,
 * reprise P0 de la migration `20261109030000_…`), pas un nom.
 */
export const ORDER_SUBJECT_TYPE = "order";

/** Les paiements par carte des commandes du scénario. */
export function scenarioCardPayments(orderIds: readonly string[]): {
  readonly subjectType: string;
  readonly subjectId: { readonly in: string[] };
} {
  return { subjectType: ORDER_SUBJECT_TYPE, subjectId: { in: [...orderIds] } };
}

/**
 * **L'argent par carte du scénario** (`card_payment`, plan M2, §3.4, §5.4) :
 * les paiements dont le sujet est une de ses commandes, et tout ce qui en
 * dépend. Aucune clé étrangère ne les relie aux commandes (le bloc est
 * agnostique) : sans cette coupe, chaque rechargement en laisserait un de plus
 * par commande payée.
 *
 * L'ordre est celui des clés (§5.4, v14) :
 *
 * 1. `public.refund_credit`, par `refund_id` — aucune clé ne la relie au
 *    carnet (identifiant opaque, §5.1) ; elle tient l'avoir, qu'on ne
 *    supprime pas : une commande facturée bloque la purge exprès ;
 * 2. `card_payment.refund` — il tient `payment` et `refund_request` ;
 * 3. `card_payment.refund_request` — elle tient `payment` ;
 * 4. `card_payment.payment`.
 *
 * Une ligne d'encaissement ne s'efface pas : les déclencheurs `*_no_delete` le
 * refusent, sauf sous `SET LOCAL card_payment.purge = 'on'` — posé ICI, dans
 * la transaction de la purge, et mort avec elle.
 *
 * ⚠️ Le témoin de reprise (`card_payment.takeover`) n'est PAS purgé : il
 * n'appartient pas au scénario (« jamais une table entière », plan §2 bis),
 * et l'effacer ferait taire le rattrapage des premiers paiements.
 *
 * @returns le nombre de lignes supprimées, toutes tables confondues.
 */
export async function purgeCardPayments(tx: PurgeClient, scope: ScenarioScope): Promise<number> {
  if (scope.orderIds.length === 0) {
    return 0;
  }
  await tx.$executeRaw`SET LOCAL card_payment.purge = 'on'`;
  const payments = { payment: scenarioCardPayments(scope.orderIds) };
  const refunds = await tx.cardRefund.findMany({ where: payments, select: { id: true } });
  const credits = await tx.refundCredit.deleteMany({
    where: { refundId: { in: refunds.map((refund) => refund.id) } },
  });
  const ledger = await tx.cardRefund.deleteMany({ where: payments });
  const requests = await tx.cardRefundRequest.deleteMany({ where: payments });
  const removed = await tx.cardPayment.deleteMany({
    where: scenarioCardPayments(scope.orderIds),
  });
  return credits.count + ledger.count + requests.count + removed.count;
}
