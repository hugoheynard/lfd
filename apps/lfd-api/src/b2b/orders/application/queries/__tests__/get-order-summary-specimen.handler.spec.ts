import type { Buffer } from "node:buffer";

import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LOGO } from "../../../domain/services/__tests__/client-sheet.fixture.js";
import { pdfText } from "../../../domain/services/__tests__/pdf-text.js";
import { specimenOrderSummaryPaper } from "../../document-specimens/specimen-order-summary.js";
import { GetOrderSummarySpecimenHandler } from "../get-order-summary-specimen.handler.js";

/** Le logo de la marque, servi par un double du port. */
class FixedBrandLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(LOGO);
  }
}

const clock = new FixedClock(new Date());

describe("GetOrderSummarySpecimenHandler", () => {
  it("rend le récapitulatif d'exemple en PDF, marqué EXEMPLE", async () => {
    const pdf = await new GetOrderSummarySpecimenHandler(clock, new FixedBrandLogo()).execute();

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe("exemple-recapitulatif-de-commandes.pdf");
    expect(pdfText(pdf.bytes)).toContain("EXEMPLE");
  });
});

describe("le récapitulatif d'exemple", () => {
  it("compte la société et son site, et laisse l'annulée hors des totaux", () => {
    const { summary } = specimenOrderSummaryPaper(clock.now());

    expect(summary.companies.map((company) => company.companyId)).toEqual([
      "specimen-company",
      "specimen-site",
    ]);
    expect(summary.total.orderCount).toBe(2);
    expect(summary.excluded).toEqual([
      { orderId: "specimen-order-3", orderNumber: "EXEMPLE-0003", reason: "cancelled" },
    ]);
  });

  it("totalise par le calcul des vraies sélections : deux fois la commande d'exemple", () => {
    const { summary } = specimenOrderSummaryPaper(clock.now());
    const [company] = summary.companies;

    expect(summary.total.bottom.totalCents).toBe(2 * (company?.bottom.totalCents ?? 0));
  });
});
