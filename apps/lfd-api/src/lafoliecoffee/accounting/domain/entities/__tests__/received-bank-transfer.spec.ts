import {
  BankTransferAmountMismatchError,
  BankTransferInvoiceNotFoundError,
  BankTransferMixedPayersError,
  InvalidBankTransferError,
  InvoiceAlreadySettledByTransferError,
  InvoiceNotPaidByTransferError,
} from "../../errors/bank-transfer-errors.js";
import {
  ReceivedBankTransfer,
  type BankTransferEntry,
  type RecordedBy,
  type TransferInvoice,
} from "../received-bank-transfer.js";

// Jours comparés entre eux seulement : `today` est donné, jamais lu à l'horloge.
const BY: RecordedBy = {
  transferId: "01VIR",
  legalEntityId: "le1",
  staffId: "staff_compta",
  at: new Date("2026-11-20T09:00:00.000Z"),
  today: "2026-11-20",
};

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
  orderIds: ["o1", "o2"],
  ...over,
});

const SECOND = invoice({
  invoiceId: "inv_2",
  number: "FA-LFD-2026-000002",
  remainingCents: 3_455,
  orderIds: ["o3"],
});

const entry = (over: Partial<BankTransferEntry> = {}): BankTransferEntry => ({
  amountCents: 12_000,
  receivedOn: "2026-11-18",
  reference: "  FA-LFD-2026-000001  ",
  invoiceIds: ["inv_1"],
  ...over,
});

describe("ReceivedBankTransfer.record — un virement reçu (V7)", () => {
  it("règle une facture dont le reste dû égale le montant, et fige le payeur", () => {
    const transfer = ReceivedBankTransfer.record(entry(), [invoice()], BY);

    expect(transfer.toState()).toEqual({
      id: "01VIR",
      legalEntityId: "le1",
      payerCompanyId: "cmp_port",
      payerName: "Boulangerie du Port",
      amountCents: 12_000,
      receivedOn: "2026-11-18",
      reference: "FA-LFD-2026-000001",
      recordedAt: BY.at,
      recordedByStaffId: "staff_compta",
      invoices: [
        {
          invoiceId: "inv_1",
          number: "FA-LFD-2026-000001",
          amountCents: 12_000,
          orderIds: ["o1", "o2"],
        },
      ],
    });
  });

  it("règle plusieurs factures du même payeur, dans l'ordre saisi", () => {
    const transfer = ReceivedBankTransfer.record(
      entry({ amountCents: 15_455, invoiceIds: ["inv_2", "inv_1"] }),
      [invoice(), SECOND],
      BY,
    );

    expect(transfer.toState().invoices.map((one) => [one.number, one.amountCents])).toEqual([
      ["FA-LFD-2026-000002", 3_455],
      ["FA-LFD-2026-000001", 12_000],
    ]);
  });

  it("un écart est refusé, en euros, dans les deux sens", () => {
    const short = (): ReceivedBankTransfer =>
      ReceivedBankTransfer.record(entry({ amountCents: 11_000 }), [invoice()], BY);
    expect(short).toThrow(BankTransferAmountMismatchError);
    expect(short).toThrow(/écart de 10,00\s€ manquants/u);

    const over = (): ReceivedBankTransfer =>
      ReceivedBankTransfer.record(
        entry({ amountCents: 15_500, invoiceIds: ["inv_1", "inv_2"] }),
        [invoice(), SECOND],
        BY,
      );
    expect(over).toThrow(/154,55\s€ restant dus\) : écart de 0,45\s€ en trop/u);
  });

  it("une facture au prélèvement, sans moyen, ou un avoir est refusé — la facture nommée", () => {
    for (const refused of [
      invoice({ paymentMeansCode: "59" }),
      invoice({ paymentMeansCode: null }),
      invoice({ isCreditNote: true }),
    ]) {
      const record = (): ReceivedBankTransfer =>
        ReceivedBankTransfer.record(entry(), [refused], BY);
      expect(record).toThrow(InvoiceNotPaidByTransferError);
      expect(record).toThrow(/FA-LFD-2026-000001/u);
    }
  });

  it("une facture déjà réglée par un virement est refusée, la facture nommée", () => {
    const record = (): ReceivedBankTransfer =>
      ReceivedBankTransfer.record(entry(), [invoice({ settledByTransferId: "01AUTRE" })], BY);

    expect(record).toThrow(InvoiceAlreadySettledByTransferError);
    expect(record).toThrow(/FA-LFD-2026-000001 est déjà réglée/u);
  });

  it("deux payeurs dans un même virement sont refusés", () => {
    expect(() =>
      ReceivedBankTransfer.record(
        entry({ amountCents: 15_455, invoiceIds: ["inv_1", "inv_2"] }),
        [invoice(), { ...SECOND, payerCompanyId: "cmp_autre" }],
        BY,
      ),
    ).toThrow(BankTransferMixedPayersError);
  });

  it("une facture inconnue, ou d'une autre entité, est introuvable", () => {
    expect(() => ReceivedBankTransfer.record(entry(), [], BY)).toThrow(
      BankTransferInvoiceNotFoundError,
    );
    expect(() =>
      ReceivedBankTransfer.record(entry(), [invoice({ legalEntityId: "le2" })], BY),
    ).toThrow(BankTransferInvoiceNotFoundError);
  });

  it.each<[string, Partial<BankTransferEntry>]>([
    ["un montant nul", { amountCents: 0 }],
    ["un montant non entier", { amountCents: 12.5 }],
    ["un jour qui n'est pas une date", { receivedOn: "2026-13-45" }],
    ["un jour futur", { receivedOn: "2026-11-21" }],
    ["une référence vide", { reference: "   " }],
    ["une référence trop longue", { reference: "x".repeat(141) }],
    ["aucune facture", { invoiceIds: [] }],
    ["une facture citée deux fois", { invoiceIds: ["inv_1", "inv_1"] }],
  ])("refuse %s", (_case, over) => {
    expect(() => ReceivedBankTransfer.record(entry(over), [invoice()], BY)).toThrow(
      InvalidBankTransferError,
    );
  });
});
