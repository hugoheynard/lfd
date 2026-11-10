import { breakdownOf, issueInput, LINES } from "../../entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../entities/invoice.js";
import { BANK_CARD } from "../../entities/invoice.types.js";
import { billingFramework, renderFacturXml } from "../facturx-xml.js";
import { facturXSamples } from "./facturx-samples.js";

/**
 * BT-23, le cadre de facturation (XP Z12-012, BR-FR-08) : `B1` le dépôt
 * d'une facture de bien, `B2` une facture de bien déjà payée EN ENTIER. Les
 * dates ne sont comparées qu'entre elles.
 */

function sample(name: string): Invoice {
  const found = facturXSamples().find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`pas de pièce témoin « ${name} »`);
  }
  return found.invoice;
}

describe("BT-23 — le cadre de facturation", () => {
  it.each(["facture-du-mois", "prelevement-sepa", "avoir-partiel"])(
    "%s : B1, le dépôt d'une facture de bien",
    (name) => {
      expect(billingFramework(sample(name).toState())).toBe("B1");
    },
  );

  it("la facture carte acquittée en entier : B2, déjà payée", () => {
    expect(billingFramework(sample("carte-acquittee").toState())).toBe("B2");
  });

  it("un déjà-payé partiel reste B1 : B2 exigerait un net à payer nul", () => {
    const vat = breakdownOf(LINES);
    const partial = Invoice.issue(
      issueInput({
        vat,
        paymentMeans: { code: BANK_CARD },
        prepayment: { amountCents: vat.totalCents - 1, paidOn: "2026-09-28" },
      }),
    );
    expect(billingFramework(partial.toState())).toBe("B1");
  });

  it("s'écrit avant le profil (BT-24), dans ExchangedDocumentContext", () => {
    expect(renderFacturXml(sample("facture-du-mois"))).toContain(
      "<rsm:ExchangedDocumentContext><ram:BusinessProcessSpecifiedDocumentContextParameter>" +
        "<ram:ID>B1</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>" +
        "<ram:GuidelineSpecifiedDocumentContextParameter>",
    );
  });
});
