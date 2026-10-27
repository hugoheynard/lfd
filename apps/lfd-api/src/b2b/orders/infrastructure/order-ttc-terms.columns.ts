import { orderRatesAmountsSchema, type OrderRateAmounts, type OrderTtcTerms } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";

/**
 * **Les TTC figés d'une commande composée en TTC**, relus pour ses documents
 * (plan `documentation/pricing/plan-centime-particuliers.md`, lot C3) : le bon
 * de commande et le courriel d'un particulier écrivent ses gestes tels qu'il
 * les a payés. Le CHECK `orders_ttc_terms_iff_exact_ht` tient les trois
 * colonnes ensemble, non nulles si et seulement si la commande est `exact_ht`.
 */
export const ORDER_TTC_TERMS_SELECT = {
  discountTtcCents: true,
  voucherTtcCents: true,
  deliveryFeeTtcCents: true,
  ttcByRate: true,
} as const;

export interface OrderTtcTermsRow {
  readonly discountTtcCents: number | null;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
  readonly ttcByRate: Prisma.JsonValue;
}

/**
 * Les champs à étaler : `{ ttcTerms, ttcByRate }` pour `exact_ht`, `{}` sinon —
 * les clés restent absentes. Une part par taux illisible, ou absente (commande
 * `exact_ht` d'avant la colonne), laisse la clé absente : la vue ne ment pas,
 * elle se tait, comme pour `vat_shares`.
 */
export function orderTtcTermsFieldOf(row: OrderTtcTermsRow): {
  readonly ttcTerms?: OrderTtcTerms;
  readonly ttcByRate?: readonly OrderRateAmounts[];
} {
  const { discountTtcCents, voucherTtcCents, deliveryFeeTtcCents } = row;
  if (discountTtcCents === null || voucherTtcCents === null || deliveryFeeTtcCents === null) {
    return {};
  }
  const byRate = orderRatesAmountsSchema.safeParse(row.ttcByRate);
  return {
    ttcTerms: {
      discountCents: discountTtcCents,
      voucherCents: voucherTtcCents,
      deliveryFeeCents: deliveryFeeTtcCents,
    },
    ...(byRate.success ? { ttcByRate: byRate.data } : {}),
  };
}
