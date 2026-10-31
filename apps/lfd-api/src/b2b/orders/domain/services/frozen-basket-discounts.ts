import type { CartAdjustment } from "@lfd/contracts";

/**
 * **Les remises de panier figées d'une commande, telles que ses lecteurs les
 * voient** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.9 et rectification du 2026-10-31 (lots M3 et M4).
 *
 * Le SEUL endroit où se décide d'où vient la liste : de `order_discounts`
 * quand la commande y a des lignes actives ; sinon des colonnes `discount_*`
 * figées, comme UNE remise de rang 1. Une commande non reprise (passée avant
 * M3, ou sautée par la reprise) n'a pas de ligne : un lecteur qui lirait la
 * table seule lui verrait zéro remise, et lui recomposerait un bon sans la
 * sienne. L9 (révision), le bon partiel, le reliquat et les manquants passent
 * tous par {@link frozenBasketDiscountsOf}.
 */

/** Une remise active, telle que L9 la compare (plan des promotions, § 18.5). */
export interface FrozenBasketPromotion {
  /** `NULL` = remise reprise d'avant L9 : on compare alors l'ajustement. */
  readonly promotionId: string | null;
  /** `NULL` = commande d'avant la colonne, reprise `frozen`. */
  readonly adjustment: CartAdjustment | null;
  /** Le libellé figé, en français — ce que le refus nomme ; `null` sans libellé. */
  readonly label: string | null;
}

/** Une remise de panier figée, dans l'ordre d'application. */
export interface FrozenBasketDiscount extends FrozenBasketPromotion {
  /**
   * La ligne `order_discounts` ; `null` = lue dans les colonnes (commande non
   * reprise) — aucune part de bon ne peut alors la citer (FK).
   */
  readonly orderDiscountId: string | null;
  /**
   * Les SKU des lignes que la remise couvre (`order_line_discounts`) ; `null`
   * = lue dans les colonnes, elle couvre alors les lignes
   * `pickup_discount_eligible`. Par SKU, parce qu'un bon ne garde pas
   * l'identifiant de la ligne de commande et qu'une couverture se décide par
   * produit : deux lignes d'un même SKU sont couvertes ensemble.
   */
  readonly coveredSkus: readonly string[] | null;
}

/** Les colonnes `discount_*` figées sur la commande — la remise unique d'hier. */
export interface FrozenDiscountColumns {
  readonly discountPromotionId: string | null;
  readonly discountAdjustment: CartAdjustment | null;
}

/**
 * La table si la commande y a des remises actives, sinon les colonnes comme
 * une remise de rang 1 — et rien si la colonne n'a pas d'ajustement (commande
 * sans remise, ou d'avant la colonne : on ne recompose pas ce qu'on ignore).
 *
 * `active` est déjà dans l'ordre des rangs.
 */
export function frozenBasketDiscountsOf(
  active: readonly FrozenBasketDiscount[],
  columns: FrozenDiscountColumns,
): readonly FrozenBasketDiscount[] {
  if (active.length > 0) {
    return active;
  }
  if (columns.discountAdjustment === null) {
    return [];
  }
  return [
    {
      orderDiscountId: null,
      promotionId: columns.discountPromotionId,
      adjustment: columns.discountAdjustment,
      label: null,
      coveredSkus: null,
    },
  ];
}

/** Une ligne vue par la couverture : son SKU, et le booléen d'hier. */
export interface CoverableLine {
  readonly sku: string;
  readonly pickupDiscountEligible: boolean;
}

/** Les indices des lignes que la remise couvre, dans l'ordre des lignes. */
export function coveredLinesOf(
  discount: FrozenBasketDiscount,
  lines: readonly CoverableLine[],
): readonly number[] {
  const skus = discount.coveredSkus === null ? null : new Set(discount.coveredSkus);
  return lines.flatMap((line, index) =>
    (skus === null ? line.pickupDiscountEligible : skus.has(line.sku)) ? [index] : [],
  );
}
