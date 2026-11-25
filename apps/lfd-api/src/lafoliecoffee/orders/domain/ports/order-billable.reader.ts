import type { AdminOrderBillable } from "@lfd/contracts";

/**
 * Port de **lecture** des montants facturables d'une commande (plan du
 * reliquat, § 5 ter, B4b.4) — le « livré » de la fiche. Route staff,
 * cross-tenant, gardée en amont par `b2b_orders`.
 */
export abstract class OrderBillableReader {
  /** `null` : commande inconnue, ou pas encore soldée. */
  abstract of(orderId: string): Promise<AdminOrderBillable | null>;
}
