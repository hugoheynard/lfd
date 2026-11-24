/**
 * **« Lesquels de ces articles sont dans un panier récurrent ? »** — la
 * lecture que les paniers récurrents publient pour le catalogue, déclarée et
 * implémentée par eux. Tout statut compte : un panier arrêté a été composé
 * dans l'unité d'alors. La réponse ne dit ni à qui, ni combien.
 */
export abstract class RecurringSkuUsage {
  abstract skusInBaskets(skus: readonly string[]): Promise<ReadonlySet<string>>;
}
