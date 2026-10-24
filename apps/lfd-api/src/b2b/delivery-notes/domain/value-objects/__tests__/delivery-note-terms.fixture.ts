import type { DeliveryNoteTerms } from "../delivery-note-terms.js";

/**
 * Des totaux de commande plausibles, partagés par les suites des BL : chaque
 * champ a une valeur DISTINCTE, pour qu'une recopie qui en intervertirait deux
 * se voie. Les JSON sont ceux qu'`orders` porte (`vat_shares`, surtaxe).
 */
export const ORDER_TERMS: DeliveryNoteTerms = {
  subtotalCents: 55_181,
  discountCents: 2_759,
  voucherDiscountCents: 500,
  deliveryFeeCents: 1_200,
  deliveryVatMode: "follows_goods",
  lateFeeCents: 300,
  lateFeeAdjustment: { kind: "percent", value: 5, vatRatePercent: 20 },
  vatShares: [{ ratePercent: 5.5, baseCents: 53_422, vatCents: 2_938 }],
  vatCents: 2_998,
  totalCents: 56_420,
};
