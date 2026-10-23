import type {
  AudiencePickupDiscount,
  CustomerAudience,
  PickupDiscountCategoryRule,
  PickupDiscountProductRule,
  PickupDiscounts,
} from "@lfd/contracts";

import {
  PickupDiscountCategoryReinclusionError,
  PickupDiscountDuplicateRuleError,
  PickupDiscountScopeIncludesNothingError,
} from "./pickup-errors.js";

/** Comment un refus nomme la clientèle — lu par du personnel, pas par du code. */
const AUDIENCE_LABEL: Readonly<Record<CustomerAudience, string>> = {
  b2b: "des pros",
  b2c: "des particuliers",
};

/**
 * **La remise d'un point de retrait, une par clientèle** (plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`,
 * 2026-10-22 — remplace « une réduction, deux cases » du plan D2).
 *
 * Un value object et pas un agrégat : des règles sans transition. Mais ces
 * règles peuvent refuser une écriture, donc elles vivent ICI — le contrôleur
 * ne connaît que la forme.
 *
 * « Pas de règle sans réduction » est **structurel** : une clientèle sans
 * remise vaut `null`, et une remise porte toujours sa réduction. Restent deux
 * refus : un mode « seulement » qui n'inclut rien, et une règle en double —
 * plus, à l'écriture seulement, une famille réglée à contre-sens du mode (Q1,
 * Hugo 2026-10-23 : la réinclusion n'est admise que sur un produit).
 */
export class PickupDiscount {
  private constructor(
    readonly b2b: AudiencePickupDiscount | null,
    readonly b2c: AudiencePickupDiscount | null,
  ) {}

  /**
   * @throws {PickupDiscountScopeIncludesNothingError} une remise « seulement » sans inclusion.
   * @throws {PickupDiscountDuplicateRuleError} une famille ou un produit réglé deux fois.
   * @throws {PickupDiscountCategoryReinclusionError} une famille à contre-sens du mode.
   */
  static of(discounts: PickupDiscounts): PickupDiscount {
    const restored = PickupDiscount.restore(discounts);
    ensureCategoriesFollowScope(restored.b2b, "b2b");
    ensureCategoriesFollowScope(restored.b2c, "b2c");
    return restored;
  }

  /**
   * Relit une remise déjà en base. Ne refuse PAS une famille à contre-sens :
   * la règle date du 2026-10-23, et une ligne écrite avant ne doit pas
   * empêcher de charger son site — l'écran la signale, et la prochaine
   * écriture de la remise la refusera.
   *
   * @throws {PickupDiscountScopeIncludesNothingError} une remise « seulement » sans inclusion.
   * @throws {PickupDiscountDuplicateRuleError} une famille ou un produit réglé deux fois.
   */
  static restore(discounts: PickupDiscounts): PickupDiscount {
    return new PickupDiscount(checked(discounts.b2b, "b2b"), checked(discounts.b2c, "b2c"));
  }

  /** Les deux remises, telles que le contrat les sert. */
  get discounts(): PickupDiscounts {
    return { b2b: this.b2b, b2c: this.b2c };
  }
}

function checked(
  discount: AudiencePickupDiscount | null,
  audience: CustomerAudience,
): AudiencePickupDiscount | null {
  if (discount === null) {
    return null;
  }
  const label = AUDIENCE_LABEL[audience];
  ensureUnique(
    discount.categories.map((rule) => rule.categoryId),
    label,
  );
  ensureUnique(
    discount.products.map((rule) => rule.productId),
    label,
  );
  const includes = [...discount.categories, ...discount.products].some((rule) => rule.eligible);
  if (discount.scope === "only" && !includes) {
    throw new PickupDiscountScopeIncludesNothingError(label);
  }
  return {
    adjustment: discount.adjustment,
    scope: discount.scope,
    categories: discount.categories.map((rule): PickupDiscountCategoryRule => ({
      categoryId: rule.categoryId,
      eligible: rule.eligible,
    })),
    products: discount.products.map((rule): PickupDiscountProductRule => ({
      productId: rule.productId,
      eligible: rule.eligible,
    })),
  };
}

/**
 * En « tous sauf », une famille ne peut qu'être exclue ; en « seulement »,
 * qu'être incluse. Le contre-sens n'appartient qu'au produit.
 */
function ensureCategoriesFollowScope(
  discount: AudiencePickupDiscount | null,
  audience: CustomerAudience,
): void {
  if (discount === null) {
    return;
  }
  const allowed = discount.scope === "only";
  const reversed = discount.categories.find((rule) => rule.eligible !== allowed);
  if (reversed !== undefined) {
    throw new PickupDiscountCategoryReinclusionError(
      AUDIENCE_LABEL[audience],
      discount.scope,
      reversed.categoryId,
    );
  }
}

function ensureUnique(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new PickupDiscountDuplicateRuleError(label, id);
    }
    seen.add(id);
  }
}
