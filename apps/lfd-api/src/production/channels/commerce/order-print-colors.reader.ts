/**
 * **La couleur de ces commandes, au moment d'imprimer** — la pastille que la
 * fiche d'atelier et chaque bon du dossier du jour posent en tête (plan
 * `comptabilite/plan-planche-des-documents-v2.md`, §0 bis, décisions de Hugo
 * du 2026-10-22 : une pastille par commande, lue au tirage, aucun mot).
 *
 * Déclaré par le fournil, implémenté par le commerce avec la règle du bon de
 * commande, relié dans `appBootstrap`. Port à lui (ISP) : le fournil ne lit ni
 * les sites, ni la clientèle — il reçoit une teinte `#rrggbb` et la pose.
 */
export abstract class OrderPrintColorsReader {
  /**
   * Par commande, sa couleur. Une commande sans couleur (inconnue, clientèle
   * ou site inconnus, couleur non posée) est ABSENTE : pas de pastille.
   */
  abstract colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
