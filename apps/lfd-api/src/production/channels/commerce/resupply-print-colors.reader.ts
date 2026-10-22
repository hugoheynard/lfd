/**
 * **La teinte de réassort des sites, au moment d'imprimer** — la part que
 * les réassorts d'un site prennent dans le camembert du compte à produire
 * (décisions du soir de Hugo, 2026-10-22, plan
 * `comptabilite/plan-planche-des-documents-v2.md`).
 *
 * Port à part d'`OrderPrintColorsReader` (ISP) : l'un répond par commande
 * avec la règle du bon, l'autre par site avec un réglage du site. Déclaré par
 * le fournil, implémenté par le commerce, relié dans `appBootstrap`.
 */
export abstract class ResupplyPrintColorsReader {
  /**
   * Par site, sa teinte de réassort `#rrggbb`. Un site inconnu, ou sans
   * teinte posée, est ABSENT : ses réassorts restent gris.
   */
  abstract colorsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
