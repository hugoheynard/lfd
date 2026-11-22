import type { InvoiceTrace, SettledOrderTrace } from "../ports/bank-transfer-trace.reader.js";

/**
 * Les écarts que le contrôle de cohérence sait nommer :
 * - `order_without_allocation` : un bon cite un virement que le bloc
 *   `payment` ne connaît pas pour sa facture (aucune part, ou la part d'un
 *   autre virement) ;
 * - `order_without_invoice` : un bon réglé par virement qu'aucune facture ne
 *   porte ;
 * - `allocation_unknown_invoice` : une part du bloc sur une facture que la
 *   facturation ne connaît pas ;
 * - `allocation_order_not_settled` : une part du bloc sur une facture dont un
 *   bon n'est pas réglé par ce virement ;
 * - `allocation_unknown_subject` : une part sur un sujet qui n'est pas une
 *   facture.
 */
export type BankTransferGapKind =
  | "order_without_allocation"
  | "order_without_invoice"
  | "allocation_unknown_invoice"
  | "allocation_order_not_settled"
  | "allocation_unknown_subject";

/** Un écart entre la facturation et le bloc `payment`. Rien ne le corrige tout seul. */
export interface BankTransferGap {
  readonly kind: BankTransferGapKind;
  readonly transferId: string;
  /** La facture (ou le sujet) en cause ; `null` pour un bon sans facture. */
  readonly invoiceId: string | null;
  readonly invoiceNumber: string | null;
  /** Le bon en cause, quand l'écart en nomme un. */
  readonly orderId: string | null;
}

/** Ce que le bloc dit d'une facture : le virement qui la règle. */
export interface InvoiceAllocationFact {
  readonly invoiceId: string;
  readonly transferId: string;
}

/** Un virement que le bloc a enregistré : ses factures et ses autres sujets. */
export interface RecordedTransferFact {
  readonly transferId: string;
  readonly invoiceIds: readonly string[];
  /** Les sujets qui ne sont pas des factures, en `type/id`. */
  readonly otherSubjects: readonly string[];
}

/**
 * **Côté facturation** : chaque bon réglé par virement doit trouver, au bloc,
 * la part de ce virement sur sa facture.
 */
export function settledOrderGaps(
  orders: readonly SettledOrderTrace[],
  allocations: readonly InvoiceAllocationFact[],
): readonly BankTransferGap[] {
  const byInvoice = new Map(allocations.map((fact) => [fact.invoiceId, fact.transferId]));
  const gaps: BankTransferGap[] = [];
  for (const order of orders) {
    const base = {
      transferId: order.bankTransferId,
      invoiceId: order.invoiceId,
      invoiceNumber: order.invoiceNumber,
      orderId: order.orderId,
    };
    if (order.invoiceId === null) {
      gaps.push({ kind: "order_without_invoice", ...base });
    } else if (byInvoice.get(order.invoiceId) !== order.bankTransferId) {
      gaps.push({ kind: "order_without_allocation", ...base });
    }
  }
  return gaps;
}

/**
 * **Côté bloc** : chaque part d'un virement enregistré doit tomber sur une
 * facture connue, dont tous les bons sont réglés par ce virement.
 */
export function recordedTransferGaps(
  transfers: readonly RecordedTransferFact[],
  invoices: readonly InvoiceTrace[],
): readonly BankTransferGap[] {
  const byId = new Map(invoices.map((invoice) => [invoice.invoiceId, invoice]));
  const gaps: BankTransferGap[] = [];
  for (const transfer of transfers) {
    for (const subject of transfer.otherSubjects) {
      gaps.push(gap("allocation_unknown_subject", transfer.transferId, subject, null, null));
    }
    for (const invoiceId of transfer.invoiceIds) {
      const invoice = byId.get(invoiceId);
      if (invoice === undefined) {
        gaps.push(gap("allocation_unknown_invoice", transfer.transferId, invoiceId, null, null));
        continue;
      }
      const stray = invoice.orders.find(
        (order) => order.settledByTransferId !== transfer.transferId,
      );
      if (stray !== undefined || invoice.orders.length === 0) {
        gaps.push(
          gap(
            "allocation_order_not_settled",
            transfer.transferId,
            invoiceId,
            invoice.number,
            stray?.orderId ?? null,
          ),
        );
      }
    }
  }
  return gaps;
}

function gap(
  kind: BankTransferGapKind,
  transferId: string,
  invoiceId: string | null,
  invoiceNumber: string | null,
  orderId: string | null,
): BankTransferGap {
  return { kind, transferId, invoiceId, invoiceNumber, orderId };
}
