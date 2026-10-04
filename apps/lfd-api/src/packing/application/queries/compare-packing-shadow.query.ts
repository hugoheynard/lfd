import type { ComparedLine } from "../../domain/services/shadow-comparison.js";

/**
 * Comparer, pour une journée, le colisable de l'ombre à celui de l'ancien
 * chemin (plan `colisage/plan-domaine-colisage.md`, K1).
 */
export class ComparePackingShadowQuery {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
  ) {}
}

/** Le stock d'un article, vu des deux côtés. */
export interface ComparedStock {
  readonly sku: string;
  /** Sorti du four, coches héritées comprises. */
  readonly legacy: number;
  /** Reçu − rendu par l'ombre. */
  readonly shadow: number;
}

/** Ce que la route de contrôle rend. Pas un contrat publié : aucun écran ne le lit (K1). */
export interface PackingShadowComparison {
  readonly serviceDay: string;
  /** Le nombre de lignes en écart — `0` est ce que la répétition doit montrer. */
  readonly gaps: number;
  readonly lines: readonly ComparedLine[];
  readonly stocks: readonly ComparedStock[];
}
