import type { ProductionGrouping } from "@lfd/contracts";

/**
 * Poser le rangement du fournil (Réglages › Production, 2026-10-30) — afficher
 * ou non les sous-catégories, et ranger par rayon ou par poste. Acte
 * **staff** : l'auteur est figé dans la ligne.
 */
export class SetProductionDisplayCommand {
  constructor(
    readonly showSubcategories: boolean,
    readonly staffUserId: string,
    /** `undefined` : le rangement en vigueur ne change pas. */
    readonly grouping?: ProductionGrouping,
  ) {}
}
