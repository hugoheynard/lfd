import { InvalidInvoiceError } from "../../errors/invoice-errors.js";
import { facturXArithmeticViolations } from "../../services/facturx-arithmetic.js";
import { renderFacturXml } from "../../services/facturx-xml.js";
import { renderInvoicePdf } from "../../services/invoice-pdf.js";
import { TEST_FONTS } from "../../services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../../services/__tests__/pdf-objects.js";
import { Invoice } from "../invoice.js";
import { BANK_CARD } from "../invoice.types.js";
import { breakdownOf, ISSUED_ON, issueInput, LINES } from "./invoice-fixtures.js";

/**
 * **La facture carte, acquittée** (lot E5a, plan
 * `facture-carte-et-remboursements.md`) : le moyen « carte »
 * (UNTDID 4461 code 48) et le déjà payé (BT-113) vont ensemble ; le reste dû
 * est nul. Les dates ne sont comparées qu'entre elles.
 */

const TTC = breakdownOf(LINES).totalCents;
const PAID_ON = "2026-09-28";

function cardInput(overrides: Parameters<typeof issueInput>[0] = {}) {
  return issueInput({
    orders: [{ orderId: "o_1", reference: "CMD-001", deliveredOn: "2026-09-29" }],
    dueOn: ISSUED_ON,
    paymentMeans: { code: BANK_CARD },
    prepayment: { amountCents: TTC, paidOn: PAID_ON },
    ...overrides,
  });
}

describe("Invoice — la facture carte acquittée", () => {
  it("porte le déjà payé et le moyen carte, et se relit à l'identique", () => {
    const invoice = Invoice.issue(cardInput());

    expect(invoice.isPrepaid).toBe(true);
    expect(invoice.toState().prepayment).toEqual({ amountCents: TTC, paidOn: PAID_ON });
    expect(Invoice.restore(invoice.toState()).toState()).toEqual(invoice.toState());
  });

  it("refuse la carte sans montant payé, et le montant payé sans la carte", () => {
    expect(() => Invoice.issue(cardInput({ prepayment: null }))).toThrow(InvalidInvoiceError);
    expect(() => Invoice.issue(cardInput({ paymentMeans: null }))).toThrow(InvalidInvoiceError);
    expect(() =>
      Invoice.issue(cardInput({ paymentMeans: { code: "59", mandateReference: "RUM-1" } })),
    ).toThrow(InvalidInvoiceError);
  });

  it("refuse un déjà payé au-delà du TTC, nul, ou payé après l'émission", () => {
    const over = { amountCents: TTC + 1, paidOn: PAID_ON };
    const zero = { amountCents: 0, paidOn: PAID_ON };
    const later = { amountCents: TTC, paidOn: "2026-10-01" };
    for (const prepayment of [over, zero, later]) {
      expect(() => Invoice.issue(cardInput({ prepayment }))).toThrow(InvalidInvoiceError);
    }
  });

  it("une facture du mois reste sans déjà payé", () => {
    expect(Invoice.issue(issueInput()).isPrepaid).toBe(false);
  });
});

describe("renderFacturXml — la facture carte (E5a)", () => {
  const xml = renderFacturXml(Invoice.issue(cardInput()));

  it("écrit le code 48, BT-113 = TTC et un reste dû nul, sans ICS ni RUM", () => {
    expect(xml).toContain(
      "<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>48</ram:TypeCode>",
    );
    expect(xml).toContain("<ram:TotalPrepaidAmount>16.55</ram:TotalPrepaidAmount>");
    expect(xml).toContain("<ram:DuePayableAmount>0.00</ram:DuePayableAmount>");
    expect(xml).not.toContain("CreditorReferenceID");
    expect(xml).not.toContain("DirectDebitMandateID");
  });

  it("écrit la date de livraison réelle du bon unique (BT-72)", () => {
    expect(xml).toContain(
      '<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">20260929</udt:DateTimeString>',
    );
  });

  it("dit l'acquit dans les conditions, mentions de retard comprises", () => {
    expect(xml).toContain("Facture acquittée le 28/09/2026 par carte.");
    expect(xml).toContain("Pénalités de retard");
  });

  it("tombe juste : BR-CO-16 lit BT-115 = BT-112 − BT-113", () => {
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });

  it("BR-CO-16 attrape un reste dû qui oublierait le déjà payé", () => {
    const wrong = xml.replace(
      "<ram:DuePayableAmount>0.00</ram:DuePayableAmount>",
      "<ram:DuePayableAmount>16.55</ram:DuePayableAmount>",
    );
    expect(facturXArithmeticViolations(wrong)).toHaveLength(1);
  });
});

describe("renderInvoicePdf — la facture carte (E5a)", () => {
  it("imprime « acquittée le … par carte » et un reste à payer nul", async () => {
    const invoice = Invoice.issue(cardInput());
    const pdf = await renderInvoicePdf({
      invoice,
      xml: renderFacturXml(invoice),
      fonts: TEST_FONTS,
      logo: null,
    });
    const printed = drawnUnicodeText(pdf);

    expect(printed).toContain("Facture acquittée le 28/09/2026 par carte.");
    expect(printed).toContain("Reste à payer : 0,00 €.");
    expect(printed).not.toContain("Prélèvement SEPA");
  });
});
