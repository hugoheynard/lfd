import type { SkuDaySales } from "../services/suggestion-attribution.js";

/**
 * Port de **lecture** des ventes d'articles, jour par jour — déclaré par la
 * recommandation, implémenté par la commande (RS6).
 *
 * Il rend des TOTAUX par jour métier et par article, jamais une commande ni
 * un client : c'est tout ce que l'attribution anonyme sait employer, et rien
 * de plus ne doit sortir de la commande pour elle.
 */
export abstract class SuggestedSkuSalesReader {
  /**
   * Pour chaque jour métier de `from` à `to` (compris, jour de PASSATION) et
   * chaque article de `skus` : la quantité commandée et le total HT des
   * lignes, en centimes. Comptent les commandes passées depuis la boutique
   * (ni brouillon, ni annulée, ni saisie par le staff, ni
   * née d'un abonnement). Un couple sans vente
   * n'est pas rendu.
   */
  abstract dailySales(
    from: string,
    to: string,
    skus: readonly string[],
  ): Promise<readonly SkuDaySales[]>;
}
