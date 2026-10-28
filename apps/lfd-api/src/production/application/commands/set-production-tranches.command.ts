/**
 * Poser les tranches de production (Réglages › Production, plan des tranches,
 * T1). Acte **staff** : l'auteur est figé dans la ligne. `mode` et les heures
 * en texte — l'agrégat les juge.
 */
export class SetProductionTranchesCommand {
  constructor(
    readonly mode: string,
    readonly fixedTranches: readonly string[],
    readonly staffUserId: string,
  ) {}
}
