/**
 * Ajouter un raccourci du fournil à un produit (plan
 * `fournil/plan-raccourcis-du-fournil.md`, S1). Acte **staff** : l'auteur
 * est figé dans la ligne. Le nom et les pièces en brut — l'agrégat les juge.
 */
export class CreateBatchShortcutCommand {
  constructor(
    readonly sku: string,
    readonly label: string,
    readonly pieces: number,
    readonly staffUserId: string,
  ) {}
}
