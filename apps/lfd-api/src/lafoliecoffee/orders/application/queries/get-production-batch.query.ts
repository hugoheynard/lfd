/**
 * Le **lot de fiches de fonction** d'une journée de service. Aucun acteur : la
 * porte est le guard staff du contrôleur, comme pour la liste des commandes.
 */
export class GetProductionBatchQuery {
  constructor(readonly date: string) {}
}
