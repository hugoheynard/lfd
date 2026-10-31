import type { CartAdjustment, DiscountLabelView } from "@lfd/contracts";

import { SplitSkuCoverageError } from "../errors/basket-discount-errors.js";

/**
 * **Les remises de panier figées d'une commande, telles que ses lecteurs les
 * voient** — plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
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

/** Le libellé d'une remise sans libellé figé (plan des promotions, § 18.4). */
export const DISCOUNT_FALLBACK_LABEL = "Remise";

/**
 * **Une remise chiffrée, telle qu'un écran ou un papier la lit** (lot M6) :
 * son libellé figé dans les trois langues, sa règle, ses montants figés.
 */
export interface FrozenDiscountAmount {
  readonly label: DiscountLabelView | null;
  readonly adjustment: CartAdjustment | null;
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
}

/** Les colonnes `discount_*` chiffrées — la remise unique d'hier, montants compris. */
export interface FrozenDiscountAmountColumns {
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  readonly discountAdjustment: CartAdjustment | null;
  readonly discountLabel: DiscountLabelView | null;
}

/**
 * Les remises chiffrées d'une commande, par le MÊME repli que
 * {@link frozenBasketDiscountsOf} : la table si la commande y a des remises
 * actives, sinon les colonnes comme une remise de rang 1.
 *
 * Seule différence, et elle est voulue : la colonne se lit dès que
 * `discountCents > 0`, même sans ajustement figé. Un lecteur d'affichage dit
 * un montant connu ; il ne recompose rien, il n'a donc pas besoin de la règle.
 */
export function frozenDiscountAmountsOf(
  active: readonly FrozenDiscountAmount[],
  columns: FrozenDiscountAmountColumns,
): readonly FrozenDiscountAmount[] {
  if (active.length > 0) {
    return active;
  }
  if (columns.discountCents <= 0) {
    return [];
  }
  return [
    {
      label: columns.discountLabel,
      adjustment: columns.discountAdjustment,
      amountCents: columns.discountCents,
      amountTtcCents: columns.discountTtcCents,
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

/** Une ligne de commande vue par la couverture : son identifiant et son SKU. */
export interface IdentifiedSkuLine {
  readonly id: string;
  readonly sku: string;
}

/**
 * Les SKU qu'une remise couvre, depuis ses couvertures par ligne
 * (`order_line_discounts`) — la forme que lit un bon.
 *
 * @throws {SplitSkuCoverageError} deux lignes d'un même SKU couvertes
 *   différemment : la couverture par SKU serait fausse (condition de M7).
 */
export function coveredSkusOf(
  orderId: string,
  lines: readonly IdentifiedSkuLine[],
  coveredLineIds: readonly string[],
): readonly string[] {
  const covered = new Set(coveredLineIds);
  const bySku = new Map<string, boolean>();
  for (const line of lines) {
    const isCovered = covered.has(line.id);
    const seen = bySku.get(line.sku);
    if (seen !== undefined && seen !== isCovered) {
      throw new SplitSkuCoverageError(orderId, line.sku);
    }
    bySku.set(line.sku, isCovered);
  }
  return [...bySku].flatMap(([sku, isCovered]) => (isCovered ? [sku] : []));
}
