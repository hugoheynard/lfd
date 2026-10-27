import { ProductNotActivatableError } from "../errors/product-errors.js";
import { activationGapsOf } from "../services/activation-gaps.js";
import type { ComplianceFinding } from "../services/product-compliance.js";

/**
 * Le refus qu'un jugement bloquant lève : un manque pour vendre. La
 * contradiction composition ↔ allergènes n'en est plus un depuis le
 * 2026-10-27 (`plan-allergenes-jamais-bloquants.md`, règle A). Lu par
 * `Product.activate` seulement.
 */
export function refusalOf(
  productId: string,
  findings: readonly ComplianceFinding[],
): ProductNotActivatableError {
  return new ProductNotActivatableError(productId, activationGapsOf(findings));
}
