/**
 * **Sous quelle référence regrouper l'historique de ces articles ?**
 * (`plan-pro-voit-les-declinaisons.md`, L7d-bis).
 *
 * Un port à lui (ISP) : seuls les rapports par article (habitudes) posent la
 * question, en lecture seule — rien n'est réécrit, ni commande ni décision.
 */
export abstract class SaleReferenceSuccessionReader {
  /**
   * La référence la plus récente de la lignée de détachement de chaque SKU
   * demandé qui en a une ; un SKU sans successeur n'est pas dans la carte.
   * Retirés compris : c'est une filiation, pas une mise en vente.
   */
  abstract latestOf(skus: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
