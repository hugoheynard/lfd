/** Combien de mois d'historique nourrissent la liste « déjà commandés ». */
export const CUSTOMER_SKUS_WINDOW_MONTHS = 12;

/** Un SKU et ce que ce client en a fait — des compteurs, rien d'interprété. */
export interface CustomerSkuTally {
  readonly sku: string;
  /** Le dernier nom facturé — le repli quand le SKU a quitté le catalogue. */
  readonly lastProductName: string;
  /** Sur combien de commandes distinctes il apparaît. */
  readonly orderCount: number;
  readonly totalQuantity: number;
  /** Chiffre d'affaires HT cumulé sur ce SKU, en centimes. */
  readonly totalCents: number;
  readonly lastOrderedAt: Date;
}

/**
 * Ce qu'une société a **déjà commandé**, agrégé par SKU.
 *
 * Un port à part et non une méthode de plus sur `OrderReader` : celui-ci rend
 * des commandes, celui-ci rend des **habitudes**. Un seul consommateur les lit
 * (l'écran de saisie du back-office), et l'écran client n'a aucune raison de se
 * voir offrir une méthode qu'il n'appellera jamais.
 *
 * Aucun nom ni prix résolus ici : ce sont des **compteurs**. Le nom et le tarif
 * qui feront foi viennent du catalogue, jamais du snapshot d'une vieille
 * commande — sans quoi le commercial annoncerait le prix de l'an dernier.
 */
export abstract class CustomerSkuReader {
  /**
   * Les SKU commandés par cette société sur les
   * {@link CUSTOMER_SKUS_WINDOW_MONTHS} derniers mois, les plus repris en tête.
   *
   * La fenêtre n'est pas une optimisation déguisée : « ce qu'il prend en ce
   * moment » est la question du commercial, et un produit arrêté il y a trois
   * ans n'a pas à remonter en tête de liste. Qu'elle borne aussi le volume lu
   * est une conséquence heureuse, pas la raison.
   */
  abstract byCompany(companyId: string): Promise<readonly CustomerSkuTally[]>;
}
