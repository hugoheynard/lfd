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
 * **Les paiements par carte du scénario** (`card_payment.payment`, plan M2,
 * §3.4) : ceux dont le sujet est une de ses commandes. Aucune clé étrangère
 * ne les tient (le bloc est agnostique) : sans cette coupe, chaque
 * rechargement en laisserait un de plus par commande payée.
 *
 * Une ligne d'encaissement ne s'efface pas : le déclencheur `payment_no_delete`
 * le refuse, sauf sous `SET LOCAL card_payment.purge = 'on'` — posé ICI, dans
 * la transaction de la purge, et mort avec elle.
 *
 * ⚠️ Le témoin de reprise (`card_payment.takeover`) n'est PAS purgé : il
 * n'appartient pas au scénario (« jamais une table entière », plan §2 bis),
 * et l'effacer ferait taire le rattrapage des premiers paiements.
 */
export async function purgeCardPayments(tx: PurgeClient, scope: ScenarioScope): Promise<number> {
  if (scope.orderIds.length === 0) {
    return 0;
  }
  await tx.$executeRaw`SET LOCAL card_payment.purge = 'on'`;
  const removed = await tx.cardPayment.deleteMany({
    where: scenarioCardPayments(scope.orderIds),
  });
  return removed.count;
}
