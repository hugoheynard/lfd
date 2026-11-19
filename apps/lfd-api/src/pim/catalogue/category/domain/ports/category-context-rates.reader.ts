/**
 * **Combien de familles règlent un taux dans un contexte de vente** — ce que
 * la famille publie pour qu'un contexte sache s'il sert, sans lire ses tables.
 */
export abstract class CategoryContextRatesReader {
  /** Pour UN contexte — l'archive le lit pour refuser un contexte qui sert. */
  abstract countIn(contextId: string): Promise<number>;
  /** Pour TOUS, en une requête ; un contexte sans taux réglé est absent. */
  abstract countByContext(): Promise<ReadonlyMap<string, number>>;
}
