import type { PricingContext, ScopedPriceFloor } from "../price-rule.js";

/**
 * Port de **lecture** des planchers.
 *
 * Séparé de `PriceRuleReader` alors que les deux servent le même calcul : ce
 * sont deux questions différentes (ISP). Le chemin qui facture lit les deux ;
 * l'écran de paramétrage, lui, lit les planchers seuls quand il n'affiche que la
 * colonne des limites. Un port unique aurait forcé ce second appelant à
 * demander des règles dont il ne fait rien.
 *
 * Comme pour les règles, l'adaptateur rend des **candidats** et non le gagnant :
 * choisir est une décision de domaine, elle reste éprouvable sans base.
 */
export abstract class PriceFloorReader {
  /** Les planchers qui visent **potentiellement** cet article. */
  abstract candidatesFor(context: PricingContext): Promise<ScopedPriceFloor[]>;

  /**
   * Tous les planchers posés — ce que l'écran de paramétrage montre.
   *
   * Daté pour la même raison que les règles : une limite archivée hier
   * protégeait bien les prix du mois dernier, et une lecture passée qui
   * l'omettrait annoncerait une marge de négociation que personne n'a eue.
   */
  abstract listAll(at: Date): Promise<ScopedPriceFloor[]>;
}
