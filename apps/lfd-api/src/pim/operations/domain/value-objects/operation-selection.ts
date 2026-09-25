import {
  DuplicateOperationSkuError,
  OperationSelectionTooLargeError,
} from "../errors/operation-errors.js";

/**
 * Au-delà, ce n'est plus une sélection mais un second catalogue. Un rayon de
 * boutique en montre quelques dizaines ; la borne laisse une marge large.
 */
export const MAX_OPERATION_SKUS = 200;

/**
 * **La sélection d'une opération** — des SKU, dans l'ordre où le rayon les
 * montre, chacun une seule fois.
 *
 * Le doublon est refusé plutôt que dédoublonné : deux places pour un même
 * article disent que l'écran s'est trompé, et choisir laquelle garder à sa
 * place serait décider pour lui. La base tient la même règle (clé primaire
 * `operation_key + sku`).
 */
export class OperationSelection {
  private constructor(readonly skus: readonly string[]) {}

  static empty(): OperationSelection {
    return new OperationSelection([]);
  }

  /**
   * Les SKU sont rognés ; un blanc n'est pas un article et disparaît.
   *
   * @throws {DuplicateOperationSkuError} un SKU revient deux fois.
   * @throws {OperationSelectionTooLargeError} plus de {@link MAX_OPERATION_SKUS} articles.
   */
  static of(raw: readonly string[]): OperationSelection {
    const skus = raw.map((sku) => sku.trim()).filter((sku) => sku !== "");
    const seen = new Set<string>();
    for (const sku of skus) {
      if (seen.has(sku)) {
        throw new DuplicateOperationSkuError(sku);
      }
      seen.add(sku);
    }
    if (skus.length > MAX_OPERATION_SKUS) {
      throw new OperationSelectionTooLargeError(MAX_OPERATION_SKUS);
    }
    return new OperationSelection(skus);
  }
}
