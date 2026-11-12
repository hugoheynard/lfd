import type { TransferInvoice } from "../../../domain/entities/received-bank-transfer.js";
import { BankTransferInvoiceNotFoundError } from "../../../domain/errors/bank-transfer-errors.js";
import {
  MemoryReceivedTransfers,
  StoreTransferInvoices,
} from "../../commands/__tests__/bank-transfer-doubles.js";
import { PreviewBankTransferHandler } from "../preview-bank-transfer.handler.js";
import { PreviewBankTransferQuery } from "../preview-bank-transfer.query.js";

const INVOICE: TransferInvoice = {
  invoiceId: "inv_1",
  number: "FA-LFD-2026-000001",
  legalEntityId: "le1",
  payerCompanyId: "cmp_port",
  payerName: "Boulangerie du Port",
  paymentMeansCode: "58",
  isCreditNote: false,
  remainingCents: 12_000,
  settledByTransferId: null,
  orderIds: ["o1"],
};

describe("PreviewBankTransferHandler — l'aperçu d'un virement", () => {
  const log: string[] = [];
  const transfers = new MemoryReceivedTransfers(log);
  const handler = new PreviewBankTransferHandler(new StoreTransferInvoices([INVOICE], transfers));

  it("lit les factures cochées et rend l'écart, sans rien écrire", async () => {
    const view = await handler.execute(new PreviewBankTransferQuery("le1", 11_000, ["inv_1"]));

    expect(view).toEqual({ amountCents: 11_000, invoicesDueCents: 12_000, gapCents: -1_000 });
    expect(transfers.added).toEqual([]);
    expect(log).toEqual([]);
  });

  it("une facture d'une autre entité est introuvable, comme à la saisie", async () => {
    await expect(
      handler.execute(new PreviewBankTransferQuery("le_autre", 12_000, ["inv_1"])),
    ).rejects.toBeInstanceOf(BankTransferInvoiceNotFoundError);
  });
});
