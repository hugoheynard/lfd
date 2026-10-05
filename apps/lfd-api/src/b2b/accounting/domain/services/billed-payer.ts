import type { BillingFollow } from "../ports/statement-billing.reader.js";

/**
 * La période `billing` de `companyId` qui couvre `at` — début inclus, fin
 * exclue, la borne de `tstzrange(valid_from, valid_to, '[)')` dans la
 * contrainte d'exclusion : il y en a donc une au plus.
 */
export function billingFollowAt(
  companyId: string,
  at: Date,
  follows: readonly BillingFollow[],
): BillingFollow | null {
  const time = at.getTime();
  return (
    follows.find(
      (follow) =>
        follow.companyId === companyId &&
        follow.validFrom.getTime() <= time &&
        (follow.validTo === null || time < follow.validTo.getTime()),
    ) ?? null
  );
}

/**
 * 🔴 **Le payeur d'une commande — le SEUL endroit où il se résout** (vue payeur
 * du relevé, avant S4).
 *
 * Une commande est réglée par le principal que son site suivait en `billing`
 * **à la date de la commande** ; sinon par la société qui a commandé. Le suivi
 * d'aujourd'hui ne déplace jamais une commande d'hier : un site détaché en
 * cours de mois laisse ses commandes d'avant chez le principal.
 *
 * S4 remplace ce calcul par la valeur figée à la passation,
 * `COALESCE(billed_company_id, company_id)` (plan-sous-comptes §2.3) : c'est
 * cette fonction, et elle seule, qu'il faudra retirer.
 */
export function billedPayerOf(
  order: { readonly companyId: string; readonly placedAt: Date },
  follows: readonly BillingFollow[],
): string {
  return billingFollowAt(order.companyId, order.placedAt, follows)?.payerId ?? order.companyId;
}
