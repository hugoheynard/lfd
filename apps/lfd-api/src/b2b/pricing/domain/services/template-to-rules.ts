import type { PricingRuleDraft } from "../entities/pricing-rule.js";
import type { TemplateLine } from "../entities/price-template.js";

/** La fenêtre sous laquelle un gabarit est posé chez un client. */
export interface TemplateWindow {
  readonly validFrom: Date;
  /** `null` = sans terme. Une mercuriale ouverte est un cas courant. */
  readonly validTo: Date | null;
}

/**
 * **Un gabarit → les règles qu'il pose.** Pure, et c'est tout l'intérêt.
 *
 * Chaque palier devient une règle de l'étage `mercuriale` qui **pose un prix**,
 * visant cet article et ce client, au seuil du palier. Le moteur n'apprend rien :
 * la spécificité arbitre déjà entre plusieurs règles d'un même étage, et son
 * troisième critère est justement le seuil de quantité — « à partir de 5 000 »
 * bat « à partir de 1 » dès que la commande atteint 5 000.
 *
 * Le « prix fixe » ne passe par aucun chemin particulier : c'est la grille à un
 * palier, qui produit une seule règle, à partir de 1.
 *
 * **Ce que cette fonction ne fait pas** : écrire. Elle rend des brouillons ;
 * c'est l'agrégat `PricingRule` qui les accepte ou les refuse un par un, et le
 * dépôt qui les pose. Un gabarit ne contourne donc aucun invariant — il en
 * traverse autant que si le commercial avait saisi chaque règle à la main.
 */
export function templateToRules(
  lines: readonly TemplateLine[],
  companyId: string,
  window: TemplateWindow,
  label: string,
): PricingRuleDraft[] {
  return lines.flatMap((line) =>
    line.tiers.map((tier) => ({
      stage: "mercuriale" as const,
      scope: { type: "product" as const, id: line.sku },
      audience: { type: "company" as const, id: companyId },
      // `1` se persiste tel quel plutôt qu'en `null` : les deux s'appliquent dès
      // la première pièce, mais `1` DIT qu'il y a une grille derrière. Le jour où
      // on relit une mercuriale pour comprendre d'où elle vient, la différence
      // entre « prix posé » et « premier palier d'une grille » est la question.
      minQuantity: tier.minQuantity,
      effect: { nature: "replace" as const, amountMillicents: tier.unitPriceMillicents },
      // Le libellé du gabarit, pas celui du palier : c'est ce que le client lira
      // dans la trace de son prix, et « Mercuriale Club Med » lui parle. Le seuil,
      // lui, est déjà porté par la règle.
      label,
      stacksOverMercuriale: false,
      validFrom: window.validFrom,
      validTo: window.validTo,
    })),
  );
}
