import type { DeliveryNoteTerms } from "../delivery-note-terms.js";

/**
 * Des totaux de commande plausibles, partagés par les suites des BL : chaque
 * champ a une valeur DISTINCTE, pour qu'une recopie qui en intervertirait deux
 * se voie. Les JSON sont ceux qu'`orders` porte (`vat_shares`, surtaxe).
 *
 * `vatShares` a la forme qu'`orders` écrit vraiment — `{ rate, amountCents }`,
 * `prisma-order.repository.ts` (vérifié le 2026-10-24, plan T) ; elle portait
 * jusque-là une forme inventée (`{ ratePercent, baseCents, vatCents }`) que le
 * BL imprimé ne reconnaissait pas.
 */
export const ORDER_TERMS: DeliveryNoteTerms = {
  subtotalCents: 55_181,
  discountCents: 2_759,
  voucherDiscountCents: 500,
  deliveryFeeCents: 1_200,
  deliveryVatMode: "follows_goods",
  lateFeeCents: 300,
  lateFeeAdjustment: { kind: "percent", value: 5, vatRatePercent: 20 },
  vatShares: [{ rate: 5.5, amountCents: 2_998 }],
  vatCents: 2_998,
  totalCents: 56_420,
};
