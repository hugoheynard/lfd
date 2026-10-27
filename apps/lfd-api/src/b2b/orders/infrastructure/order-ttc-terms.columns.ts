import type { OrderTtcTerms } from "@lfd/contracts";

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
} as const;

export interface OrderTtcTermsRow {
  readonly discountTtcCents: number | null;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
}

/** Le champ à étaler : `{ ttcTerms }` pour `exact_ht`, `{}` sinon — la clé reste absente. */
export function orderTtcTermsFieldOf(row: OrderTtcTermsRow): { readonly ttcTerms?: OrderTtcTerms } {
  const { discountTtcCents, voucherTtcCents, deliveryFeeTtcCents } = row;
  if (discountTtcCents === null || voucherTtcCents === null || deliveryFeeTtcCents === null) {
    return {};
  }
  return {
    ttcTerms: {
      discountCents: discountTtcCents,
      voucherCents: voucherTtcCents,
      deliveryFeeCents: deliveryFeeTtcCents,
    },
  };
}
