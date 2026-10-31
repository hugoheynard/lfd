/**
 * **Le libellé d'une remise, figé dans les trois langues du client** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 15.8 et § 15.12 Q1, lot L8b) — celui de l'audience de l'acheteur, repli
 * sur le libellé commun déjà résolu : aucune langue n'y est vide.
 *
 * Sans zod : la boutique le lit au démarrage avec la remise d'un point.
 */
export interface DiscountLabelView {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

/** La langue d'un libellé de remise ; une autre langue retombe sur le français. */
export function discountLabelIn(label: DiscountLabelView, locale: string): string {
  return locale === "en" ? label.en : locale === "it" ? label.it : label.fr;
}
