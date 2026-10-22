import type { CartAdjustment } from "./cart-adjustment.js";
import type { CustomerAudience } from "./customer-audience.js";

/**
 * **Ce que couvre la remise d'un point de retrait**, sans zod — la boutique
 * peut le lire au démarrage (même raison de poids que
 * `pickup-discount-audiences.ts`), et le serveur s'en sert au devis comme à la
 * passation. `pickup.ts` porte le schéma, qui reste l'autorité sur la forme.
 *
 * Plan `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`
 * (Hugo, 2026-10-22) : une remise par clientèle, chacune avec un MODE de
 * portée et des règles par catégorie et par produit.
 */

/**
 * Le mode de portée : `all_except` = toutes les lignes sauf celles que les
 * règles retirent (l'existant) ; `only` = aucune ligne sauf celles que les
 * règles incluent.
 */
export type PickupDiscountScope = "all_except" | "only";

/** Une règle sur une famille du catalogue : ses lignes sont éligibles ou non. */
export interface PickupDiscountCategoryRule {
  readonly categoryId: string;
  readonly eligible: boolean;
}

/** Une règle sur un produit — elle couvre toutes ses déclinaisons (Q2). */
export interface PickupDiscountProductRule {
  readonly productId: string;
  readonly eligible: boolean;
}

/** La remise d'un point pour UNE clientèle. */
export interface AudiencePickupDiscount {
  readonly adjustment: CartAdjustment;
  readonly scope: PickupDiscountScope;
  readonly categories: readonly PickupDiscountCategoryRule[];
  readonly products: readonly PickupDiscountProductRule[];
}

/** Les deux remises d'un point ; `null` = cette clientèle n'en reçoit pas. */
export interface PickupDiscounts {
  readonly b2b: AudiencePickupDiscount | null;
  readonly b2c: AudiencePickupDiscount | null;
}

/** Aucune remise, pour personne. */
export const NO_PICKUP_DISCOUNTS: PickupDiscounts = { b2b: null, b2c: null };

/** La remise du point pour cette clientèle, ou `null` si elle n'en reçoit pas. */
export function pickupDiscountFor(
  point: { readonly discounts: PickupDiscounts },
  audience: CustomerAudience,
): AudiencePickupDiscount | null {
  return point.discounts[audience];
}

/** Ce qu'il faut savoir d'une ligne pour juger son éligibilité. */
export interface PickupDiscountLineFacts {
  /** `null` = produit inconnu du catalogue : seul le mode décide. */
  readonly productId: string | null;
  /** La famille de la ligne puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
}

/**
 * **La ligne entre-t-elle dans l'assiette de la remise ?**
 *
 * 1. une règle sur son PRODUIT l'emporte (Q1 : on réinclut un produit dans
 *    une famille exclue, ou on l'exclut d'une famille remisée) ;
 * 2. sinon la règle de la famille LA PLUS PROCHE — la même lecture de lignée
 *    que la tarification ;
 * 3. sinon le mode : `all_except` éligible, `only` non.
 */
export function pickupDiscountCovers(
  discount: AudiencePickupDiscount,
  line: PickupDiscountLineFacts,
): boolean {
  const product =
    line.productId === null
      ? undefined
      : discount.products.find((rule) => rule.productId === line.productId);
  if (product !== undefined) {
    return product.eligible;
  }
  for (const categoryId of line.categoryPath) {
    const rule = discount.categories.find((candidate) => candidate.categoryId === categoryId);
    if (rule !== undefined) {
      return rule.eligible;
    }
  }
  return discount.scope === "all_except";
}

/** La remise a-t-elle des règles ? Sans règle en `all_except`, toute ligne est éligible. */
export function pickupDiscountHasRules(discount: AudiencePickupDiscount): boolean {
  return (
    discount.scope === "only" || discount.categories.length > 0 || discount.products.length > 0
  );
}
