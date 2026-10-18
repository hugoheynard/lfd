import {
  DuplicateSuggestedSkuError,
  SuggestedCountError,
} from "../errors/staff-suggestion-errors.js";

/** Une suggestion montre trois articles au plus (`suggestions-du-staff.md` §2). */
export const MAX_SUGGESTED_SKUS = 3;

/**
 * **Les articles montrés**, dans l'ordre voulu : 1 à 3, distincts, rognés.
 *
 * @throws {SuggestedCountError} aucun, ou plus de trois.
 * @throws {DuplicateSuggestedSkuError} le même deux fois.
 */
export function suggestedSkus(raw: readonly string[]): readonly string[] {
  const skus = raw.map((sku) => sku.trim()).filter((sku) => sku !== "");
  if (skus.length === 0 || skus.length > MAX_SUGGESTED_SKUS) {
    throw new SuggestedCountError(skus.length, MAX_SUGGESTED_SKUS);
  }
  const seen = new Set<string>();
  for (const sku of skus) {
    if (seen.has(sku)) {
      throw new DuplicateSuggestedSkuError(sku);
    }
    seen.add(sku);
  }
  return skus;
}
