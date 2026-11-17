import type { ProductionGrouping } from "@lfd/contracts";

/**
 * **Simuler le dossier de prod** (`documentation/fournil/les-postes-du-fournil.md`, § 3.11) : une pièce de chaque article
 * vendable, rangée dans le mode demandé — quel que soit le réglage —, rendue
 * en PDF. Rien n'est écrit, archivé ni envoyé.
 *
 * `showSubcategories` à `null` : l'affichage du réglage en vigueur.
 */
export class GetProductionSimulationPdfQuery {
  constructor(
    readonly mode: ProductionGrouping,
    readonly showSubcategories: boolean | null = null,
  ) {}
}
