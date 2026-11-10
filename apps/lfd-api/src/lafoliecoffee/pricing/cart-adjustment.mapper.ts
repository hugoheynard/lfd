import type { CartAdjustment } from "@lfd/contracts";

/**
 * Persistance d'un {@link CartAdjustment} sur deux colonnes `(mode, value)` —
 * `value` = points de base (percent) ou centimes (amount). `mode` null = pas
 * d'ajustement. Partagé par la remise d'un point de retrait et le frais d'une zone.
 */
export interface AdjustmentColumns {
  readonly mode: "percent" | "amount" | null;
  readonly value: number | null;
}

/** VO → colonnes. `null` → `(null, null)`. */
export function toAdjustmentColumns(adjustment: CartAdjustment | null): AdjustmentColumns {
  if (adjustment === null) {
    return { mode: null, value: null };
  }
  return adjustment.mode === "percent"
    ? { mode: "percent", value: adjustment.bp }
    : { mode: "amount", value: adjustment.cents };
}

/** Colonnes → VO. Une colonne nulle ⇒ pas d'ajustement (`null`). */
export function fromAdjustmentColumns(
  mode: "percent" | "amount" | null,
  value: number | null,
): CartAdjustment | null {
  if (mode === null || value === null) {
    return null;
  }
  return mode === "percent" ? { mode: "percent", bp: value } : { mode: "amount", cents: value };
}
