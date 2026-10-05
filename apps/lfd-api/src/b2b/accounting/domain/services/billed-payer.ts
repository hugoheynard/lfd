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
 * 🔴 **Le payeur d'une commande — le SEUL endroit où il se lit.**
 *
 * Depuis S4, le payeur est COPIÉ sur la commande à sa passation
 * (`orders.billed_company_id`, plan-sous-comptes §2.3) : c'est lui, et la
 * résolution vivante n'y entre plus. Réaligner un site ne déplace jamais une
 * commande déjà passée d'un payeur à l'autre.
 *
 * ⚠️ **La résolution à date ne sert plus qu'aux commandes d'AVANT S4**, qui
 * n'ont pas la colonne (aucun remplissage rétroactif, §5) : le principal que
 * le site suivait en `billing` à la date de la commande, sinon la société qui
 * a commandé. Elle disparaîtra quand plus aucun relevé ni lot ne lira une
 * commande sans payeur copié.
 */
export function billedPayerOf(
  order: {
    readonly companyId: string;
    readonly placedAt: Date;
    readonly billedCompanyId: string | null;
  },
  follows: readonly BillingFollow[],
): string {
  if (order.billedCompanyId !== null) {
    return order.billedCompanyId;
  }
  return billingFollowAt(order.companyId, order.placedAt, follows)?.payerId ?? order.companyId;
}
