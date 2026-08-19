/** Commande **batch** : recalculer la norme catalogue (médiane par produit). */
export class RecomputeProductNormsCommand {
  constructor(readonly windowDays: number) {}
}
