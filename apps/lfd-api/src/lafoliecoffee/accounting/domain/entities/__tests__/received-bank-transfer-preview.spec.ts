import {
  BankTransferAmountMismatchError,
  InvalidBankTransferError,
  InvoiceAlreadySettledByTransferError,
  InvoiceNotPaidByTransferError,
} from "../../errors/bank-transfer-errors.js";
import {
  previewBankTransfer,
  ReceivedBankTransfer,
  type TransferInvoice,
} from "../received-bank-transfer.js";

const invoice = (over: Partial<TransferInvoice> = {}): TransferInvoice => ({
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
  ...over,
});
const SECOND = invoice({ invoiceId: "inv_2", number: "FA-LFD-2026-000002", remainingCents: 3_455 });
const BOTH = ["inv_1", "inv_2"];

describe("previewBankTransfer — l'écart avant de valider", () => {
  it("dit le reste dû des factures cochées, le montant et l'écart manquant", () => {
    expect(previewBankTransfer(15_000, BOTH, [invoice(), SECOND], "le1")).toEqual({
      amountCents: 15_000,
      invoicesDueCents: 15_455,
      gapCents: -455,
    });
  });

  it("un écart positif est un montant reçu en trop ; nul quand le compte est juste", () => {
    expect(previewBankTransfer(12_100, ["inv_1"], [invoice()], "le1").gapCents).toBe(100);
    expect(previewBankTransfer(15_455, BOTH, [invoice(), SECOND], "le1").gapCents).toBe(0);
  });

  it("à écart nul, la saisie aboutit ; sinon elle refuse le même écart (une seule arithmétique)", () => {
    const by = {
      transferId: "v1",
      legalEntityId: "le1",
      staffId: "s1",
      at: new Date(0),
      today: "2026-11-20",
    };
    const base = { receivedOn: "2026-11-18", reference: "REF", invoiceIds: BOTH };
    const invoices = [invoice(), SECOND];

    expect(previewBankTransfer(15_455, BOTH, invoices, "le1").gapCents).toBe(0);
    expect(() =>
      ReceivedBankTransfer.record({ ...base, amountCents: 15_455 }, invoices, by),
    ).not.toThrow();
    expect(previewBankTransfer(15_000, BOTH, invoices, "le1").gapCents).not.toBe(0);
    expect(() =>
      ReceivedBankTransfer.record({ ...base, amountCents: 15_000 }, invoices, by),
    ).toThrow(BankTransferAmountMismatchError);
  });

  it("refuse les factures que la saisie refuserait : pas au virement, déjà réglée", () => {
    expect(() =>
      previewBankTransfer(12_000, ["inv_1"], [invoice({ paymentMeansCode: "59" })], "le1"),
    ).toThrow(InvoiceNotPaidByTransferError);
    expect(() =>
      previewBankTransfer(12_000, ["inv_1"], [invoice({ settledByTransferId: "v0" })], "le1"),
    ).toThrow(InvoiceAlreadySettledByTransferError);
  });

  it("refuse un montant non positif ou une facture citée deux fois", () => {
    expect(() => previewBankTransfer(0, ["inv_1"], [invoice()], "le1")).toThrow(
      InvalidBankTransferError,
    );
    expect(() => previewBankTransfer(12_000, ["inv_1", "inv_1"], [invoice()], "le1")).toThrow(
      InvalidBankTransferError,
    );
  });
});
