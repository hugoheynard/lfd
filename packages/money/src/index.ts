export type { Exact } from "./exact.js";

export {
  MILLICENTS_PER_CENT,
  fromMillicents,
  roundToMillicents,
  millicentsFromCents,
  centsFromMillicents,
  lineTotalCents,
  unitPriceCents,
} from "./millicents.js";
export {
  fromCents,
  scaleByBasisPoints,
  fractionByBasisPoints,
  addCents,
  compareExact,
  roundToCents,
  divideByBasisPoints,
} from "./exact.js";
export {
  RATIO_UNIT_BP,
  isoRevenueRatioBp,
  requiredVolume,
  attainmentBp,
  observedRatioBp,
} from "./elasticity.js";

export { gapBp, discountBp, averageGapBp } from "./gap.js";
export { DELIVERY_VAT_RATE, ventilateVat, ttcCentsOf } from "./vat.js";
export type { VatExtra, VatLine, VatShare, VatVentilation, VatVentilationInput } from "./vat.js";
export { composeTtcOrder, percentOf } from "./ttc-order.js";
export type {
  TtcComposedLine,
  TtcComposedTerm,
  TtcOrderAdjustment,
  TtcOrderComposition,
  TtcOrderDeliveryFee,
  TtcOrderInput,
  TtcOrderLine,
  TtcRatePart,
} from "./ttc-order.js";
export { ttcOfHtAmount } from "./ttc-of-ht-amount.js";

/**
 * La déduction du hors taxe depuis un prix d'étiquette — arrivée de
 * `@lfd/pim-contracts` le 2026-09-21, quand un second site en a eu besoin.
 */
export { htFromTtc, htMillicentsOf, ttcCentsFromHtMillicents } from "./tax.js";
export { invoiceVatBreakdown } from "./invoice-vat.js";
export { splitCents, splitOrderByRate } from "./order-vat-split.js";
export type { OrderVatSplit, RatedCents } from "./order-vat-split.js";
export type {
  InvoiceAllowance,
  InvoiceCharge,
  InvoiceVatBreakdown,
  InvoiceVatCategory,
  InvoiceVatInput,
  InvoiceVatPart,
} from "./invoice-vat.js";
