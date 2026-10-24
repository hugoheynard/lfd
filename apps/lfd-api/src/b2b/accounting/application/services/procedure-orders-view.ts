import type { CollectionProcedureInvoicesView, ProcedureOrderView } from "@lfd/contracts";

/**
 * Les chiffres clés de l'onglet « Factures », comptés sur la liste même qu'il
 * montre : un chiffre et sa liste ne divergent pas.
 *
 * `issuableCount` : les réceptions confirmées — celles que l'émission
 * prendra (l'assiette lit `received_on`, que la base impose à toute remise
 * depuis B4 de `documentation/commandes/date-de-reception.md`).
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
    issuableCount: count("receipt_confirmed"),
  };
}
