import type { InvoiceVatBreakdown } from "@lfd/money";

import { breakdownOf, issueInput, line } from "../../entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../entities/invoice.js";
import { BANK_CARD } from "../../entities/invoice.types.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { facturXArithmeticViolations } from "../facturx-arithmetic.js";
import { renderFacturXml } from "../facturx-xml.js";
import { REFUND_LINE_LABEL, refundCreditNote, remainingTtcCents } from "../refund-credit-note.js";

/**
 * **L'avoir d'un remboursement** (lot E5b, arbitrage A9) : le prorata, le
 * reste exact au solde, et des partiels qui totalisent la facture sans que
 * `assertWithinCorrected` refuse le dernier. Les dates ne sont comparées
 * qu'entre elles.
 */

/** 1 000 c à 5,5 % (TVA 55) et 500 c à 20 % (TVA 100) : 1 655 c TTC. */
const LINES = [line("PAIN", 5.5, 1_000), line("JUS", 20, 500)];
const VAT = breakdownOf(LINES);

function cardInvoice(): Invoice {
  return Invoice.issue(
    issueInput({
      orders: [{ orderId: "o_1", reference: "CMD-001", deliveredOn: "2026-09-29" }],
      lines: LINES,
      vat: VAT,
      dueOn: "2026-09-30",
      paymentMeans: { code: BANK_CARD },
      prepayment: { amountCents: VAT.totalCents, paidOn: "2026-09-28" },
    }),
  );
}

/** Émet les avoirs d'une suite de remboursements, comme le rapprochement. */
function creditAll(invoice: Invoice, refunds: readonly number[]): Invoice[] {
  const notes: Invoice[] = [];
  refunds.forEach((amount, index) => {
    const prior = notes.map((note) => note.toState().vat);
    const credit = refundCreditNote(invoice.toState().vat, prior, amount);
    if (credit === null) {
      throw new Error(`aucun avoir pour ${String(amount)} c`);
    }
    notes.push(
      Invoice.creditNote({
        id: `cn_${String(index)}`,
        number: InvoiceNumber.compose(2026, index + 2),
        issuedOn: "2026-10-02",
        corrected: invoice,
        priorCreditNotes: [...notes],
        orders: invoice.toState().orders,
        lines: credit.lines,
        vat: credit.vat,
      }),
    );
  });
  return notes;
}

function rate(vat: InvoiceVatBreakdown, value: number) {
  return vat.categories.find((category) => category.rate === value);
}

describe("refundCreditNote — le prorata", () => {
  it("partage le TTC au prorata du TTC de chaque taux, une ligne « Remboursement » par taux", () => {
    const credit = refundCreditNote(VAT, [], 331);

    expect(credit?.vat.totalCents).toBe(331);
    // 331 × 1 055 / 1 655 = 211,0 ; 331 × 600 / 1 655 = 120,0.
    expect(rate(credit?.vat ?? VAT, 5.5)).toMatchObject({ taxableBaseCents: 200, vatCents: 11 });
    expect(rate(credit?.vat ?? VAT, 20)).toMatchObject({ taxableBaseCents: 100, vatCents: 20 });
    expect(credit?.lines.map((l) => [l.label, l.vatRate, l.amountCents])).toEqual([
      [REFUND_LINE_LABEL, 5.5, 200],
      [REFUND_LINE_LABEL, 20, 100],
    ]);
  });

  it("refuse un montant nul ou au-delà de ce qui reste", () => {
    expect(refundCreditNote(VAT, [], 0)).toBeNull();
    expect(refundCreditNote(VAT, [], VAT.totalCents + 1)).toBeNull();
  });

  it("l'avoir au prorata tombe juste en Factur-X (BR-S-09 compris)", () => {
    const [note] = creditAll(cardInvoice(), [777]);
    expect(facturXArithmeticViolations(renderFacturXml(note ?? cardInvoice()))).toEqual([]);
  });
});

describe("refundCreditNote — le remboursement qui solde", () => {
  it("prend le reste exact, taux par taux", () => {
    const invoice = cardInvoice();
    const [first] = creditAll(invoice, [331]);
    const prior = [first?.toState().vat ?? VAT];
    const last = refundCreditNote(VAT, prior, remainingTtcCents(VAT, prior));

    expect(rate(last?.vat ?? VAT, 5.5)).toMatchObject({ taxableBaseCents: 800, vatCents: 44 });
    expect(rate(last?.vat ?? VAT, 20)).toMatchObject({ taxableBaseCents: 400, vatCents: 80 });
  });

  it.each([[[500, 500, 655]], [[1, 1, 1, 1, 1_651]], [[333, 333, 333, 333, 323]], [[1_654, 1]]])(
    "des partiels %j totalisent la facture sans refus du dernier",
    (refunds) => {
      const invoice = cardInvoice();
      const notes = creditAll(invoice, refunds);
      const total = (value: number, field: "taxableBaseCents" | "vatCents") =>
        notes.reduce((sum, note) => sum + (rate(note.toState().vat, value)?.[field] ?? 0), 0);

      expect(notes.reduce((sum, note) => sum + note.totalTtcCents, 0)).toBe(VAT.totalCents);
      for (const value of [5.5, 20]) {
        expect(total(value, "taxableBaseCents")).toBe(rate(VAT, value)?.taxableBaseCents);
        expect(total(value, "vatCents")).toBe(rate(VAT, value)?.vatCents);
      }
      expect(
        remainingTtcCents(
          VAT,
          notes.map((note) => note.toState().vat),
        ),
      ).toBe(0);
    },
  );
});
