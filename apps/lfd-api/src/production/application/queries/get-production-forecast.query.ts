/**
 * **Le prévisionnel** d'une plage de jours de service.
 *
 * Aucun acteur : la porte est le guard staff du contrôleur, comme pour l'état
 * d'une journée. Les deux bornes arrivent en texte — le domaine les découpe et
 * refuse ce qui n'est pas une plage.
 */
export class GetProductionForecastQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
