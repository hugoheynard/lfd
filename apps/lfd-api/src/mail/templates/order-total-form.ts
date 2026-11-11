import type { ClientSheet, SheetVariant } from "@lfd/contracts";

/**
 * **Le total d'un pro au compte se dit hors taxe** (F5, plan
 * `bons-et-facture-concordants`) : la TVA se calcule une fois sur la facture
 * du mois, et un TTC par bon la contredirait de quelques centimes. La
 * confirmation de commande et l'e-mail « commande modifiée » lisent cette
 * même règle.
 */
export function totalIsPretaxOnly(sheet: ClientSheet): boolean {
  return sheet.money.settlement === "account";
}

/**
 * **Comment un e-mail de commande écrit un total** :
 *
 * - `pretax` : un pro au compte — le HT seul ({@link totalIsPretaxOnly}) ;
 * - `both` : un pro qui paie par carte — le TTC d'abord, c'est le montant
 *   payé, remboursé ou complété, puis le HT de ses bons ;
 * - `with_tax` : un particulier — le TTC seul.
 *
 * La clientèle est celle de la feuille (`variant`), lue sur la commande.
 */
export type OrderTotalForm = "pretax" | "both" | "with_tax";

export function orderTotalFormOf(sheet: ClientSheet): OrderTotalForm {
  return orderTotalFormFor(totalIsPretaxOnly(sheet), sheet.variant);
}

/**
 * La même règle, pour un e-mail qui n'a pas de feuille : `onAccount` = la
 * commande se règle au compte, `variant` = pro ou public.
 */
export function orderTotalFormFor(onAccount: boolean, variant: SheetVariant): OrderTotalForm {
  if (onAccount) {
    return "pretax";
  }
  return variant === "pro" ? "both" : "with_tax";
}
