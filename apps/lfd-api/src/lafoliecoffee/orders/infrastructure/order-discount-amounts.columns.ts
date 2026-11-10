import {
  cartAdjustmentSchema,
  type CartAdjustment,
  type DiscountLabelView,
  type OrderDiscountView,
} from "@lfd/contracts";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import {
  frozenDiscountAmountsOf,
  type FrozenDiscountAmount,
} from "../domain/services/frozen-basket-discounts.js";

/**
 * **Les remises de panier d'une commande, chiffrées pour sa lecture** (plan
 * des promotions, § 18.6, lot M6) — la vue client, la vue du personnel et le
 * bon de commande qui en dérive. Le repli est celui du domaine
 * ({@link frozenDiscountAmountsOf}) : la table si la commande y a des remises
 * actives, sinon les colonnes — jamais `order_discounts` seule, une commande
 * non reprise y aurait zéro remise.
 */
export const ORDER_DISCOUNT_AMOUNTS_SELECT = {
  where: { archivedAt: null },
  select: { label: true, adjustment: true, amountCents: true, amountTtcCents: true },
  orderBy: { rank: "asc" },
} as const satisfies Prisma.Order$discountsArgs;

/** La forme que Prisma rend pour {@link ORDER_DISCOUNT_AMOUNTS_SELECT}. */
export interface OrderDiscountAmountRow {
  readonly label: Prisma.JsonValue | null;
  readonly adjustment: Prisma.JsonValue | null;
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
}

/** Ce que la commande porte pour se lire avec son repli. */
export interface OrderDiscountAmountsSource {
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  readonly discountAdjustment: Prisma.JsonValue | null;
  readonly discountLabel: Prisma.JsonValue | null;
  readonly discounts: readonly OrderDiscountAmountRow[];
}

/**
 * `{ discounts }` quand la commande porte PLUSIEURS remises, `{}` sinon : une
 * seule remise se dit par les champs d'hier, et la clé reste absente.
 */
export function orderDiscountsFieldOf(row: OrderDiscountAmountsSource): {
  readonly discounts?: readonly OrderDiscountView[];
} {
  const amounts = frozenDiscountAmountsOf(
    row.discounts.map((discount) => ({
      label: labelOf(discount.label),
      adjustment: adjustmentOf(discount.adjustment),
      amountCents: discount.amountCents,
      amountTtcCents: discount.amountTtcCents,
    })),
    {
      discountCents: row.discountCents,
      discountTtcCents: row.discountTtcCents,
      discountAdjustment: adjustmentOf(row.discountAdjustment),
      discountLabel: labelOf(row.discountLabel),
    },
  );
  return amounts.length < 2 ? {} : { discounts: amounts.map(toView) };
}

function toView(amount: FrozenDiscountAmount): OrderDiscountView {
  return {
    ...(amount.label === null ? {} : { label: amount.label }),
    adjustment: amount.adjustment,
    amountCents: amount.amountCents,
    amountTtcCents: amount.amountTtcCents,
  };
}

const labelSchema = z.object({ fr: z.string(), en: z.string(), it: z.string() });

/** Un libellé d'une autre forme se tait : il n'entre dans aucun calcul. */
function labelOf(value: Prisma.JsonValue | null): DiscountLabelView | null {
  const parsed = labelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Une règle illisible se tait aussi : la lecture dit le montant, pas la règle. */
function adjustmentOf(value: Prisma.JsonValue | null): CartAdjustment | null {
  const parsed = cartAdjustmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
