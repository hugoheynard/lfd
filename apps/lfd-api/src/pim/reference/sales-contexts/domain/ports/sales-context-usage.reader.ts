/**
 * **Combien de taux sont réglés sur un contexte**, famille ou fiche — ce que
 * l'archive lit pour refuser un contexte qui sert.
 *
 * Un port à part du dépôt (ISP) : l'archive n'a besoin que de ce compte. La
 * règle — « un contexte qui porte des taux ne s'archive pas » — est dans
 * `SalesContextAggregate.archive`.
 */
export abstract class SalesContextUsageReader {
  abstract ratedBy(contextId: string): Promise<number>;
}
