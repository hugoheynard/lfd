import type { TransferToRecord } from "../../../payment/channels/requests/index.js";
import { INVOICE_PAYMENT_SUBJECT } from "../domain/entities/invoice.types.js";
import type { ReceivedBankTransfer } from "../domain/entities/received-bank-transfer.js";

/**
 * Le virement jugé par la facturation, tel que le bloc `payment` l'enregistre :
 * le même identifiant que celui que les bons citent, l'entité et le payeur
 * opaques, une part par facture dans l'ordre saisi, chacune de son reste dû.
 */
export function transferToRecord(transfer: ReceivedBankTransfer): TransferToRecord {
  const state = transfer.toState();
  return {
    id: state.id,
    receivedInto: state.legalEntityId,
    payerRef: state.payerCompanyId,
    amountCents: state.amountCents,
    receivedOn: state.receivedOn,
    reference: state.reference,
    recordedAt: state.recordedAt,
    recordedBy: state.recordedByStaffId,
    parts: state.invoices.map((invoice) => ({
      subject: { type: INVOICE_PAYMENT_SUBJECT, id: invoice.invoiceId },
      amountCents: invoice.amountCents,
    })),
  };
}
