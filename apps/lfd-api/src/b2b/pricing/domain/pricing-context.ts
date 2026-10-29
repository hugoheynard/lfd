import type { PricingContext } from "./price-rule.js";
import type { PricedItem, PricingParties } from "./loaded-pricer.js";

/**
 * Ce que l'appelant sait du client au moment de résoudre.
 *
 * Défini dans le **domaine**, avec le tarificateur qui le lit, et réexporté ici
 * pour les appelants historiques. Deux déclarations de la même notion auraient
 * fini par diverger d'un champ.
 */
export type { PricingParties } from "./loaded-pricer.js";

/**
 * Construit le contexte de résolution à partir de ce que le **catalogue en
 * place** sait donner.
 *
 * Trois points à lire avant de « corriger » ce fichier :
 *
 * 1. **`productSku` et `variantSku` valent le même SKU, et c'est le modèle.**
 *    Le tarif est À PLAT (Hugo, 2026-10-29, `plan-pro-voit-les-declinaisons.md`) :
 *    toute décision — mercuriale, plancher, palier, promotion, engagement — vise
 *    UNE référence de vente et ne vaut que pour elle. Une décision posée sur
 *    `P-X` n'atteint pas `P-X-2` ; seul le tarif de BASE peut suivre le défaut,
 *    et c'est le référentiel qui le dit (`pricingFollowsDefault`), pas ce
 *    contexte. Il n'y a donc aucun SKU produit à poser ici (vérifié le
 *    2026-10-29 : `all()` rend chaque déclinaison montrée sous son SKU de vente).
 * 2. ~~`categoryId` est le code de rayon~~ — **refermé le 2026-09-26** : la
 *    famille est la lignée d'identifiants du référentiel (`categoryPath`), et
 *    la migration `les_familles_se_lisent_en_donnees` a repris les portées
 *    posées en code.
 * 3. **`segmentId` est toujours `null`.** Aucune notion de segment n'existe sur
 *    `Company`. L'audience `segment` est modélisée et **inatteignable** : elle
 *    attend que les segments existent, et ne fausse rien en attendant puisque
 *    aucune règle ne peut la viser.
 *
 * Centraliser ces choix ici plutôt que de les disperser chez les appelants :
 * le jour où l'un d'eux change, il n'y a qu'un fichier à relire.
 */
export function pricingContextFor(
  /**
   * L'article : son SKU, sa famille puis ses parentes (vide = famille inconnue,
   * aucune règle de famille), et son unité de vente.
   */
  { sku, categoryPath, saleUnit }: Pick<PricedItem, "sku" | "categoryPath" | "saleUnit">,
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
    categoryPath,
    saleUnit,
    companyId: parties.companyId,
    pricingCompanyId: parties.pricingCompanyId,
    segmentId: null,
    cumulativeQuantity,
  };
}
