import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  type InvoicePdfFonts,
  InvoiceFontSource,
} from "../../../domain/ports/invoice-font-source.js";
import { TEST_FONTS } from "../../../domain/services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../../../domain/services/__tests__/pdf-objects.js";
import { GetInvoiceSpecimenHandler } from "../get-invoice-specimen.handler.js";
import { GetInvoiceSpecimenQuery } from "../get-invoice-specimen.query.js";

/** Les vraies polices, servies par un double du port. */
class Fonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.resolve(TEST_FONTS);
  }
}

describe("GetInvoiceSpecimenHandler", () => {
  it("rend la facture d'exemple en PDF/A-3 Factur-X, marquée EXEMPLE", async () => {
    const handler = new GetInvoiceSpecimenHandler(new FixedClock(new Date()), new Fonts());

    const pdf = await handler.execute(new GetInvoiceSpecimenQuery());
    const raw = pdf.bytes.toString("latin1");

    expect(raw.startsWith("%PDF-1.7")).toBe(true);
    expect(raw).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(pdf.fileName).toBe("exemple-facture.pdf");
    expect(drawnUnicodeText(pdf.bytes)).toContain("EXEMPLE");
  });

  it("rend la facture d'exemple au virement : le bloc de règlement, jamais de RUM", async () => {
    const handler = new GetInvoiceSpecimenHandler(new FixedClock(new Date()), new Fonts());

    const pdf = await handler.execute(new GetInvoiceSpecimenQuery("bank_transfer"));
    const printed = drawnUnicodeText(pdf.bytes);

    expect(pdf.fileName).toBe("exemple-facture-virement.pdf");
    expect(printed).toContain("Règlement par virement");
    expect(printed).toContain("IBAN : FR76 3000 6000 0112 3456 7890 189");
    expect(printed).toContain("BIC : AGRIFRPP");
    expect(printed).not.toContain("RUM");
  });
});
