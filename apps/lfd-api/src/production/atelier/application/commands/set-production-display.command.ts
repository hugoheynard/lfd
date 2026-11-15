/**
 * Poser le rangement du fournil (Réglages › Production, 2026-10-30) — afficher
 * ou non les sous-catégories. Acte **staff** : l'auteur est figé dans la ligne.
 */
export class SetProductionDisplayCommand {
  constructor(
    readonly showSubcategories: boolean,
    readonly staffUserId: string,
  ) {}
}
