import type { PricingContext } from "../domain/price-rule.js";

/** Ce que l'appelant sait du client au moment de résoudre. */
export interface PricingParties {
  readonly companyId: string | null;
}

/**
 * Construit le contexte de résolution à partir de ce que le **catalogue en
 * place** sait donner.
 *
 * Trois écarts assumés aujourd'hui, tous temporaires et tous réparés par la
 * bascule du catalogue (C5b) sans que cet appelant change :
 *
 * 1. **`productSku` et `variantSku` valent le même SKU.** Le seed ne connaît
 *    qu'un niveau ; le PIM en aura deux (un produit, ses déclinaisons). Une
 *    règle de portée `variant` et une de portée `product` visent donc la même
 *    chose pour l'instant — ce qui est correct, pas approximatif : il n'y a
 *    réellement qu'un article derrière ce SKU.
 * 2. **`categoryId` est le code de rayon** (`viennoiserie`…), pas l'identifiant
 *    PIM. Une règle de portée `category` saisie aujourd'hui devra donc être
 *    reprise à la bascule — c'est noté, et il n'y en a aucune.
 * 3. **`segmentId` est toujours `null`.** Aucune notion de segment n'existe sur
 *    `Company`. L'audience `segment` est modélisée et **inatteignable** : elle
 *    attend que les segments existent, et ne fausse rien en attendant puisque
 *    aucune règle ne peut la viser.
 *
 * Centraliser ces écarts ici plutôt que de les disperser chez les appelants :
 * le jour de la bascule, il n'y a qu'un fichier à relire.
 */
export function pricingContextFor(
  sku: string,
  categoryCode: string,
  quantity: number,
  parties: PricingParties,
  at: Date,
  /**
   * Le cumul de l'engagement, cette commande comprise, ou `null` s'il n'y en a
   * pas. Passé par l'appelant plutôt que lu ici : ce fichier assemble un
   * contexte, il n'interroge aucune base.
   */
  cumulativeQuantity: number | null = null,
): PricingContext {
  return {
    at,
    quantity,
    variantSku: sku,
    productSku: sku,
    categoryId: categoryCode,
    companyId: parties.companyId,
    segmentId: null,
    cumulativeQuantity,
  };
}
