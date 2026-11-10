import type { DeliveryPricingTerms } from "@lfd/contracts";

import {
  fromAdjustmentColumns,
  toAdjustmentColumns,
} from "../../pricing/cart-adjustment.mapper.js";

type Mode = "percent" | "amount";

/**
 * Les six colonnes « par audience » que portent À LA FOIS le réglage global
 * (`delivery_pricing_settings`) et le remplacement d'une zone
 * (`delivery_zones`) — mêmes noms, mêmes CHECK (migration
 * `20261105140000_le_reglage_global_de_livraison`).
 */
export interface DeliveryPricingColumns {
  readonly b2bFeeMode: Mode | null;
  readonly b2bFeeValue: number | null;
  readonly b2bFreeDeliveryThresholdCents: number | null;
  readonly b2cFeeMode: Mode | null;
  readonly b2cFeeValue: number | null;
  readonly b2cFreeDeliveryThresholdCents: number | null;
}

/** Rien de réglé, pour les deux audiences. */
export const UNSET_DELIVERY_PRICING_COLUMNS: DeliveryPricingColumns = {
  b2bFeeMode: null,
  b2bFeeValue: null,
  b2bFreeDeliveryThresholdCents: null,
  b2cFeeMode: null,
  b2cFeeValue: null,
  b2cFreeDeliveryThresholdCents: null,
};

/** La sélection Prisma des six colonnes. */
export const DELIVERY_PRICING_COLUMNS = {
  b2bFeeMode: true,
  b2bFeeValue: true,
  b2bFreeDeliveryThresholdCents: true,
  b2cFeeMode: true,
  b2cFeeValue: true,
  b2cFreeDeliveryThresholdCents: true,
} as const;

/** Colonnes → termes ; une colonne nulle = rien de réglé. */
export function termsFromColumns(row: DeliveryPricingColumns): DeliveryPricingTerms {
  return {
    b2b: {
      fee: fromAdjustmentColumns(row.b2bFeeMode, row.b2bFeeValue),
      freeDeliveryThresholdCents: row.b2bFreeDeliveryThresholdCents,
    },
    b2c: {
      fee: fromAdjustmentColumns(row.b2cFeeMode, row.b2cFeeValue),
      freeDeliveryThresholdCents: row.b2cFreeDeliveryThresholdCents,
    },
  };
}

/** Termes → colonnes. */
export function termsToColumns(terms: DeliveryPricingTerms): DeliveryPricingColumns {
  const b2bFee = toAdjustmentColumns(terms.b2b.fee);
  const b2cFee = toAdjustmentColumns(terms.b2c.fee);
  return {
    b2bFeeMode: b2bFee.mode,
    b2bFeeValue: b2bFee.value,
    b2bFreeDeliveryThresholdCents: terms.b2b.freeDeliveryThresholdCents,
    b2cFeeMode: b2cFee.mode,
    b2cFeeValue: b2cFee.value,
    b2cFreeDeliveryThresholdCents: terms.b2c.freeDeliveryThresholdCents,
  };
}
