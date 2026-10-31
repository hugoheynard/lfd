import type { OrderView, SheetDiscountLine, SheetMoney } from "@lfd/contracts";

import { DISCOUNT_FALLBACK_LABEL } from "./frozen-basket-discounts.js";

/**
 * **Les lignes de remise du bon de commande** (plan des promotions, § 18.6,
 * lot M6) — une par remise, dans l'ordre d'application, seulement quand la
 * commande en porte PLUSIEURS (`OrderView.discounts`, déjà passée par le
 * repli `frozenDiscountAmountsOf`). Le papier écrit le libellé figé en
 * français, repli « Remise » ; les trois langues suivent pour l'e-mail. Une
 * seule remise garde la ligne d'hier, son point et son assiette compris.
 */
export function orderDiscountLinesOf(
  order: Pick<OrderView, "discounts">,
): Pick<SheetMoney, "discountLines"> {
  const discounts = order.discounts;
  if (discounts === undefined || discounts.length < 2) {
    return {};
  }
  const discountLines: SheetDiscountLine[] = discounts.map((discount) => ({
    label: discount.label?.fr ?? DISCOUNT_FALLBACK_LABEL,
    cents: discount.amountCents,
    ttcCents: discount.amountTtcCents,
    ...(discount.label === undefined ? {} : { labels: discount.label }),
  }));
  return { discountLines };
}
