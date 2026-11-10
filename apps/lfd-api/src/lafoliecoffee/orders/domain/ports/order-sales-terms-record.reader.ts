import type { OrderSalesTermsResponse } from "@lfd/contracts";

/**
 * Port de **lecture** des CGV qu'une commande porte, pour son détail au
 * back-office (plan `legal/plan-cgv-par-audience.md`, C4, C4′). Distinct du
 * port qui les lit EN VIGUEUR à la passation : l'un relit le passé figé,
 * l'autre le présent.
 *
 * Aucun mur tenant : la route est staff, gardée par `@AdminSurface("b2b_orders")`,
 * et le staff voit toutes les commandes.
 */
export abstract class OrderSalesTermsRecordReader {
  /** `null` = aucune commande sous cet id. */
  abstract of(orderId: string): Promise<OrderSalesTermsResponse | null>;
}
