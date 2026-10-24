import type { CollectionProcedureInvoicesView, ProcedureOrderView } from "@lfd/contracts";

/**
 * Les chiffres clés de l'onglet « Factures », comptés sur la liste même qu'il
 * montre : un chiffre et sa liste ne divergent pas.
 *
 * `issuableCount` : les réceptions confirmées qui ont leur jour de réception —
 * celles que l'émission prendra (l'assiette lit `received_on`).
 */
export function procedureOrdersView(
  orders: readonly ProcedureOrderView[],
): Pick<CollectionProcedureInvoicesView, "orders" | "figures" | "issuableCount"> {
  const count = (status: ProcedureOrderView["status"]): number =>
    orders.filter((order) => order.status === status).length;
  return {
    orders,
    figures: {
      invoiced: count("invoiced"),
      receiptConfirmed: count("receipt_confirmed"),
      receiptToConfirm: count("receipt_to_confirm"),
    },
    issuableCount: orders.filter(
      (order) => order.status === "receipt_confirmed" && !order.deliveryDayMissing,
    ).length,
  };
}
