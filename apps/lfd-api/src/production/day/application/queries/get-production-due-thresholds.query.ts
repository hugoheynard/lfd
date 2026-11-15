/**
 * **Le compte à rebours d'une journée** : avant quelle heure sortir quoi
 * (plan production par vagues, V0). `date` en texte — le domaine la découpe.
 */
export class GetProductionDueThresholdsQuery {
  constructor(readonly date: string) {}
}
