/** Une norme calculée, prête à remplacer la projection. */
export interface ComputedProductNorm {
  readonly sku: string;
  readonly medianQuantity: number;
  readonly sampleLines: number;
}

/**
 * Le recalcul de la **norme catalogue**.
 *
 * `compute` fait le travail lourd **en base** — une médiane sur toutes les lignes
 * d'une fenêtre ne se rapatrie pas en mémoire. `replaceAll` remplace la
 * projection entière : c'est un read-model dérivé, pas un agrégat à réconcilier,
 * donc il n'a pas d'état à préserver.
 */
export abstract class ProductNormStore {
  abstract compute(input: {
    readonly windowDays: number;
    readonly now: Date;
  }): Promise<ComputedProductNorm[]>;

  abstract replaceAll(
    norms: readonly ComputedProductNorm[],
    computedAt: Date,
    windowDays: number,
  ): Promise<number>;
}
