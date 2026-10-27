import {
  ProductAllergenContradictionError,
  ProductNotActivatableError,
  type AllergenContradiction,
} from "../errors/product-errors.js";
import { activationGapsOf } from "../services/activation-gaps.js";
import type { ComplianceFinding } from "../services/product-compliance.js";

/**
 * Le refus qu'un jugement bloquant lève, nommé d'après son cas : un manque
 * pour vendre d'abord (il se règle sans toucher à la composition), sinon la
 * contradiction d'allergènes. Lu par `Product.activate` seulement.
 */
export function refusalOf(
  productId: string,
  findings: readonly ComplianceFinding[],
): ProductNotActivatableError | ProductAllergenContradictionError {
  const blocking = findings.filter((finding) => finding.severity === "blocking");
  const contradictions: AllergenContradiction[] = blocking.flatMap((finding) =>
    finding.code === "allergens_cited_not_declared" || finding.code === "allergens_contradict_none"
      ? [
          {
            sku: finding.sku,
            declaresNone: finding.code === "allergens_contradict_none",
            allergenCodes: finding.allergenCodes,
          },
        ]
      : [],
  );
  if (contradictions.length === blocking.length) {
    return new ProductAllergenContradictionError(productId, contradictions);
  }
  return new ProductNotActivatableError(productId, activationGapsOf(findings));
}
