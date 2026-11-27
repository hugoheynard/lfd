/**
 * **« Les favoris de cette société »** — la colonne de gauche du
 * planificateur (plan `plan-planificateur-de-commandes.md`, § 6.2). Déclaré
 * par le planificateur, implémenté par le commerce avec le store des favoris
 * de la boutique : le bloc ne lit pas `public.shop_favorite`.
 *
 * Les favoris sont gardés par espace, et un site est son propre espace : ce
 * sont ceux de la société, partagés par tous ses membres.
 */
export abstract class PlannerFavoriteSkus {
  /** Les SKU en favori de la société, du plus récent au plus ancien. */
  abstract skusOf(companyId: string): Promise<readonly string[]>;
}
