import {
  CreditNoteExceedsInvoiceError,
  InvalidCreditNoteError,
} from "../../errors/invoice-errors.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { Invoice, type IssueCreditNoteInput } from "../invoice.js";
import type { InvoiceLineInput } from "../invoice.types.js";
import { breakdownOf, issueInput, issuedInvoice, line, LINES } from "./invoice-fixtures.js";

/** L'avoir 381 (plan `facture-emise.md`). */

function creditInput(
  corrected: Invoice,
  lines: readonly InvoiceLineInput[],
  overrides: Partial<IssueCreditNoteInput> = {},
): IssueCreditNoteInput {
  return {
    id: "cn_1",
    number: InvoiceNumber.compose(2026, 2),
    issuedOn: "2026-10-03",
    corrected,
    priorCreditNotes: [],
    orders: [],
    lines,
    vat: breakdownOf(lines),
    ...overrides,
  };
}

describe("Invoice.creditNote", () => {
  it("corrige toute la facture : mêmes parties, montants positifs, type 381", () => {
    const invoice = issuedInvoice();
    const note = Invoice.creditNote(creditInput(invoice, LINES));
    expect(note.isCreditNote).toBe(true);
    expect(note.toState()).toMatchObject({
      type: "381",
      correctedInvoiceId: invoice.id,
      correctedInvoiceNumber: "FA-2026-000001",
      dueOn: null,
      buyer: invoice.toState().buyer,
      mentions: invoice.toState().mentions,
    });
    expect(note.totalTtcCents).toBe(invoice.totalTtcCents);
  });

  it("corrige une part de la facture, et cite le bon visé", () => {
    const orders = [{ orderId: "o_1", reference: "CMD-001", deliveredOn: "2026-09-12" }];
    const note = Invoice.creditNote(
      creditInput(issuedInvoice(), [line("PAIN", 5.5, 400)], { orders }),
    );
    expect([note.totalHtCents, note.toState().orders]).toEqual([400, orders]);
  });

  it("tient compte des avoirs déjà émis : le plafond est ce qui reste", () => {
    const invoice = issuedInvoice();
    const first = Invoice.creditNote(creditInput(invoice, [line("PAIN", 5.5, 600)]));
    const remaining = creditInput(invoice, [line("PAIN", 5.5, 400)], {
      id: "cn_2",
      number: InvoiceNumber.compose(2026, 3),
      priorCreditNotes: [first],
    });
    expect(Invoice.creditNote(remaining).totalHtCents).toBe(400);
    const over = {
      ...remaining,
      lines: [line("PAIN", 5.5, 401)],
      vat: breakdownOf([line("PAIN", 5.5, 401)]),
    };
    expect(() => Invoice.creditNote(over)).toThrow(CreditNoteExceedsInvoiceError);
  });

  it("refuse de dépasser la facture sur un taux, même sous son total", () => {
    // 501 c à 20 % : sous le TTC de la facture (1 655 c), au-delà de sa base à ce taux (500 c).
    expect(() => Invoice.creditNote(creditInput(issuedInvoice(), [line("JUS", 20, 501)]))).toThrow(
      CreditNoteExceedsInvoiceError,
    );
  });

  it("refuse un taux absent de la facture", () => {
    expect(() => Invoice.creditNote(creditInput(issuedInvoice(), [line("X", 10, 100)]))).toThrow(
      CreditNoteExceedsInvoiceError,
    );
  });

  it("refuse un avoir à zéro : il porte un montant positif", () => {
    expect(() => Invoice.creditNote(creditInput(issuedInvoice(), [line("PAIN", 5.5, 0)]))).toThrow(
      CreditNoteExceedsInvoiceError,
    );
  });

  it("refuse de corriger un avoir", () => {
    const note = Invoice.creditNote(creditInput(issuedInvoice(), LINES));
    const input = creditInput(note, LINES, { number: InvoiceNumber.compose(2026, 3) });
    expect(() => Invoice.creditNote(input)).toThrow(InvalidCreditNoteError);
  });

  it.each([
    ["daté avant la facture", { issuedOn: "2026-09-29" }],
    ["au numéro de la facture", { number: InvoiceNumber.compose(2026, 1) }],
    [
      "sur un bon absent de la facture",
      { orders: [{ orderId: "o_9", reference: "CMD-9", deliveredOn: null }] },
    ],
  ])("refuse un avoir %s", (_case, overrides) => {
    expect(() => Invoice.creditNote(creditInput(issuedInvoice(), LINES, overrides))).toThrow(
      InvalidCreditNoteError,
    );
  });

  it("refuse un avoir antérieur qui corrige une autre facture", () => {
    const other = Invoice.issue(
      issueInput({ id: "inv_2", number: InvoiceNumber.compose(2026, 5) }),
    );
    const foreign = Invoice.creditNote(creditInput(other, LINES));
    const input = creditInput(issuedInvoice(), LINES, { priorCreditNotes: [foreign] });
    expect(() => Invoice.creditNote(input)).toThrow(InvalidCreditNoteError);
  });
});
