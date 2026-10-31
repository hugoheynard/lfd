import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import type { OrderDiscountLabel } from "../domain/entities/order-shapes.js";
import type { RevisableDiscount } from "../domain/services/basket-discount-replay.js";
import type { IdentifiedSkuLine } from "../domain/services/frozen-basket-discounts.js";
import {
  ACTIVE_ORDER_DISCOUNTS_SELECT,
  activeDiscountOf,
  type ActiveOrderDiscountRow,
} from "./order-discounts.columns.js";
import {
  FROZEN_TERMS_SELECT,
  frozenTermsOf,
  type FrozenTermsColumns,
} from "./order-discount-terms.columns.js";

/**
 * **Les remises actives d'une commande, telles que la révision les rejoue**
 * (`documentation/promotions/plan-remises-acquises.md`, § 10.2) : la sélection
 * partagée des remises actives, plus ce que seul le rejeu lit — le libellé
 * dans ses trois langues, le montant figé, et les termes.
 */
export const REVISABLE_ORDER_DISCOUNTS_SELECT = {
  ...ACTIVE_ORDER_DISCOUNTS_SELECT,
  select: {
    ...ACTIVE_ORDER_DISCOUNTS_SELECT.select,
    amountCents: true,
    amountTtcCents: true,
    ...FROZEN_TERMS_SELECT,
  },
} as const satisfies Prisma.Order$discountsArgs;

export interface RevisableOrderDiscountRow extends ActiveOrderDiscountRow, FrozenTermsColumns {
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
}

/**
 * @throws {FrozenAdjustmentUnreadableError} un ajustement figé illisible.
 * @throws {SplitSkuCoverageError} une couverture qui coupe un SKU en deux.
 * @throws {FrozenTermsUnreadableError} des termes figés illisibles.
 */
export function revisableDiscountOf(
  orderId: string,
  row: RevisableOrderDiscountRow,
  lines: readonly IdentifiedSkuLine[],
): RevisableDiscount {
  return {
    ...activeDiscountOf(orderId, row, lines),
    servedLabel: frozenLabelOf(row.label),
    amountCents: row.amountCents,
    amountTtcCents: row.amountTtcCents,
    terms: frozenTermsOf(row.id, row),
  };
}

const labelSchema = z.object({ fr: z.string(), en: z.string(), it: z.string() });

/**
 * Le libellé figé, trois langues ; une forme inattendue se tait — un libellé
 * n'entre dans aucun calcul, et le rejeu le refigerait tel quel.
 */
export function frozenLabelOf(value: Prisma.JsonValue | null): OrderDiscountLabel | null {
  const parsed = labelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
