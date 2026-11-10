/**
 * Port de **lecture** du nom de la société au nom de qui un récapitulatif
 * imprimé est demandé (`plan-recapitulatif-des-commandes.md`, lot R2) — la
 * société de l'URL, qu'aucune commande comptée ne nomme forcément : un
 * principal peut récapituler les seules commandes de ses sites.
 *
 * Distinct de {@link CompanyOrderSummaryReader} : le récapitulatif à l'écran
 * ne le lit pas.
 */
export abstract class OrderSummaryRequesterReader {
  /** Le nom affiché (enseigne, sinon raison sociale), ou `null` : société inconnue. */
  abstract nameOf(companyId: string): Promise<string | null>;
}
