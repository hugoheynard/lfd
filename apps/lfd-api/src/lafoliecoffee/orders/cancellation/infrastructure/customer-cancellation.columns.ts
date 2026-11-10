import type { FixedCustomerCancellation } from "../domain/services/customer-cancellation-window.js";

/**
 * Les colonnes du délai figé (`orders.customer_cancellation_fixed`,
 * `orders.customer_cancellation_hours_before`, Hugo 2026-10-26) ↔ le type du
 * domaine. Le booléen distingue « passée sans délai » (figée, heures nulles)
 * de « non figée » (société, équipe, ou d'avant les colonnes).
 */
export interface CustomerCancellationColumns {
  readonly customerCancellationFixed: boolean;
  readonly customerCancellationHoursBefore: number | null;
}

export function customerCancellationColumnsOf(
  fixed: FixedCustomerCancellation,
): CustomerCancellationColumns {
  return {
    customerCancellationFixed: fixed.kind !== "not_fixed",
    customerCancellationHoursBefore: fixed.kind === "delay" ? fixed.hoursBefore : null,
  };
}

export function fixedCustomerCancellationOf(
  columns: CustomerCancellationColumns,
): FixedCustomerCancellation {
  if (columns.customerCancellationHoursBefore !== null) {
    return { kind: "delay", hoursBefore: columns.customerCancellationHoursBefore };
  }
  return columns.customerCancellationFixed ? { kind: "no_delay" } : { kind: "not_fixed" };
}
