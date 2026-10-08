import { InvalidInvoiceError } from "../../errors/invoice-errors.js";
import { renderFacturXml } from "../../services/facturx-xml.js";
import { facturXArithmeticViolations } from "../../services/facturx-arithmetic.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { Invoice } from "../invoice.js";
import { LINES, SELLER, breakdownOf, issueInput } from "./invoice-fixtures.js";

/**
 * Le moyen de paiement figé (BG-16, lot E4, question E3a b) : la facture
 * d'un payeur au compte dit « prélèvement SEPA », l'ICS et la RUM.
 */

const SEPA = { code: "59", mandateReference: "RUM-PORT-1" } as const;

describe("Invoice — le moyen de paiement figé (BG-16)", () => {
  it("la facture garde le prélèvement et sa RUM ; la relecture aussi", () => {
    const invoice = Invoice.issue(issueInput({ paymentMeans: SEPA }));

    expect(invoice.toState().paymentMeans).toEqual(SEPA);
    expect(Invoice.restore(invoice.toState()).toState().paymentMeans).toEqual(SEPA);
  });

  it("refuse une RUM vide ou plus longue que 35 caractères", () => {
    for (const mandateReference of ["  ", "R".repeat(36)]) {
      expect(() =>
        Invoice.issue(issueInput({ paymentMeans: { code: "59", mandateReference } })),
      ).toThrow(InvalidInvoiceError);
    }
  });

  it("un avoir n'annonce aucun paiement, même sur une facture prélevée", () => {
    const invoice = Invoice.issue(issueInput({ paymentMeans: SEPA }));
    const note = Invoice.creditNote({
      id: "cn_1",
      number: InvoiceNumber.compose(2026, 2),
      issuedOn: invoice.toState().issuedOn,
      corrected: invoice,
      priorCreditNotes: [],
      orders: [],
      lines: LINES,
      vat: breakdownOf(LINES),
    });

    expect(note.toState().paymentMeans).toBeNull();
  });
});

describe("renderFacturXml — le prélèvement SEPA", () => {
  it("écrit le code 59, l'ICS du vendeur (BT-90) et la RUM (BT-89)", () => {
    const xml = renderFacturXml(Invoice.issue(issueInput({ paymentMeans: SEPA })));

    expect(xml).toContain(`<ram:CreditorReferenceID>${SELLER.ics}</ram:CreditorReferenceID>`);
    expect(xml).toContain(
      "<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>59</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>",
    );
    expect(xml).toContain("<ram:DirectDebitMandateID>RUM-PORT-1</ram:DirectDebitMandateID>");
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });

  it("sans mandat figé, aucun moyen n'est écrit plutôt qu'un moyen deviné", () => {
    const xml = renderFacturXml(Invoice.issue(issueInput()));

    expect(xml).not.toContain("SpecifiedTradeSettlementPaymentMeans");
    expect(xml).not.toContain("CreditorReferenceID");
    expect(xml).not.toContain("DirectDebitMandateID");
  });
});
