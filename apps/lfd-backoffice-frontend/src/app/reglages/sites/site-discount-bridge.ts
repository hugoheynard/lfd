import type {
  AudiencePickupDiscount,
  CartAdjustment,
  PickupDiscountAudiences,
  PickupDiscounts,
} from '@lfd/contracts';

/**
 * **Le pont entre la carte d'avant et les remises par clientèle** (2026-10-22).
 *
 * ⚠️ Provisoire : le serveur sert désormais une remise PAR clientèle, avec ses
 * règles de portée (plan `plan-remise-retrait-par-clientele-et-exclusions.md`,
 * lot A). La carte qui les édite toutes les deux est le lot B ; d'ici là,
 * l'écran garde sa carte « une réduction, deux cases » et ce pont la traduit.
 */

/** Ce que la carte d'avant montre : une réduction, et les cases qui la reçoivent. */
export interface SingleDiscount {
  readonly discount: CartAdjustment | null;
  readonly audiences: PickupDiscountAudiences;
}

/**
 * La réduction affichée : celle des pros, sinon celle des particuliers. Deux
 * réductions différentes ne se montrent pas ici — le lot B les montre.
 */
export function singleDiscountOf(discounts: PickupDiscounts): SingleDiscount {
  return {
    discount: discounts.b2b?.adjustment ?? discounts.b2c?.adjustment ?? null,
    audiences: { b2b: discounts.b2b !== null, b2c: discounts.b2c !== null },
  };
}

/**
 * La carte d'avant → les deux remises. Une clientèle qui garde sa remise garde
 * aussi son mode et ses règles : la carte ne les voit pas, elle ne les efface
 * pas.
 */
export function discountsFrom(single: SingleDiscount, current: PickupDiscounts): PickupDiscounts {
  const keep = (existing: AudiencePickupDiscount | null): AudiencePickupDiscount | null =>
    single.discount === null
      ? null
      : existing === null
        ? { adjustment: single.discount, scope: 'all_except', categories: [], products: [] }
        : { ...existing, adjustment: single.discount };
  return {
    b2b: single.audiences.b2b ? keep(current.b2b) : null,
    b2c: single.audiences.b2c ? keep(current.b2c) : null,
  };
}
