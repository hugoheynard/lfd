import { cartAdjustmentSchema, type CartAdjustment } from "@lfd/contracts";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import {
  coveredSkusOf,
  frozenBasketDiscountsOf,
  type FrozenBasketDiscount,
  type IdentifiedSkuLine,
} from "../domain/services/frozen-basket-discounts.js";
import { FrozenAdjustmentUnreadableError } from "./frozen-adjustment-unreadable.error.js";

/**
 * **Les remises de panier d'une commande, relues** (plan des promotions,
 * § 18.9, rectification du 2026-10-31, lot M4) — une seule sélection et une
 * seule traduction pour la révision, la décision d'un départ incomplet, ses
 * bons et la part d'un bon au départ. Le repli sur les colonnes est celui du
 * domaine ({@link frozenBasketDiscountsOf}) : jamais `order_discounts` seule.
 *
 * Les couvertures se lisent par jointure sur la remise NON archivée (§ 18.7) :
 * le `where` porte sur la remise parente, ses couvertures suivent.
 */
/** Les lignes que {@link basketDiscountsOfRow} lit à côté des remises. */
export const DISCOUNT_COVERAGE_LINES_SELECT = { select: { id: true, sku: true } } as const;

export const ACTIVE_ORDER_DISCOUNTS_SELECT = {
  where: { archivedAt: null },
  select: {
    id: true,
    promotionId: true,
    adjustment: true,
    label: true,
    coveredLines: { select: { orderLineId: true } },
  },
  orderBy: { rank: "asc" },
} as const satisfies Prisma.Order$discountsArgs;

/** La forme que Prisma rend pour {@link ACTIVE_ORDER_DISCOUNTS_SELECT}. */
export interface ActiveOrderDiscountRow {
  readonly id: string;
  readonly promotionId: string | null;
  readonly adjustment: Prisma.JsonValue | null;
  readonly label: Prisma.JsonValue | null;
  readonly coveredLines: readonly { readonly orderLineId: string }[];
}

/** Ce qu'une commande porte pour se lire avec son repli. */
export interface BasketDiscountColumnsRow {
  readonly discountPromotionId: string | null;
  /** Les lignes de la commande, pour rapporter chaque couverture à ses SKU. */
  readonly lines: readonly IdentifiedSkuLine[];
  readonly discountAdjustment: Prisma.JsonValue | null;
  readonly discounts: readonly ActiveOrderDiscountRow[];
}

/**
 * Les remises de la commande : la table si elle a des lignes actives, sinon
 * les colonnes `discount_*` comme une remise de rang 1.
 *
 * @throws {FrozenAdjustmentUnreadableError} un ajustement figé illisible.
 */
export function basketDiscountsOfRow(
  orderId: string,
  row: BasketDiscountColumnsRow,
): readonly FrozenBasketDiscount[] {
  return frozenBasketDiscountsOf(
    row.discounts.map((discount) => activeDiscountOf(orderId, discount, row.lines)),
    {
      discountPromotionId: row.discountPromotionId,
      discountAdjustment: frozenCartAdjustmentOf(orderId, row.discountAdjustment, "remise"),
    },
  );
}

/**
 * @throws {FrozenAdjustmentUnreadableError}
 * @throws {SplitSkuCoverageError} une couverture qui coupe un SKU en deux.
 */
export function activeDiscountOf(
  orderId: string,
  row: ActiveOrderDiscountRow,
  lines: readonly IdentifiedSkuLine[],
): FrozenBasketDiscount {
  return {
    orderDiscountId: row.id,
    promotionId: row.promotionId,
    adjustment: frozenCartAdjustmentOf(orderId, row.adjustment, "remise de panier"),
    label: frenchLabelOf(row.label),
    coveredSkus: coveredSkusOf(
      orderId,
      lines,
      row.coveredLines.map((covered) => covered.orderLineId),
    ),
  };
}

const frozenLabelSchema = z.object({ fr: z.string() });

/** Le libellé figé, en français ; une forme inattendue se tait — un libellé n'entre dans aucun calcul. */
function frenchLabelOf(value: Prisma.JsonValue | null): string | null {
  const parsed = frozenLabelSchema.safeParse(value);
  return parsed.success ? parsed.data.fr : null;
}

/** Un ajustement figé relu, ou `null`. @throws {FrozenAdjustmentUnreadableError} */
export function frozenCartAdjustmentOf(
  orderId: string,
  value: Prisma.JsonValue | null,
  column: string,
): CartAdjustment | null {
  if (value === null) {
    return null;
  }
  const result = cartAdjustmentSchema.safeParse(value);
  if (!result.success) {
    throw new FrozenAdjustmentUnreadableError(orderId, column);
  }
  return result.data;
}
