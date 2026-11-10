import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  type InvoicePdfFonts,
  InvoiceFontSource,
} from "../../../domain/ports/invoice-font-source.js";
import { TEST_FONTS } from "../../../domain/services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../../../domain/services/__tests__/pdf-objects.js";
import { GetInvoiceSpecimenHandler } from "../get-invoice-specimen.handler.js";

/** Les vraies polices, servies par un double du port. */
class Fonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.resolve(TEST_FONTS);
  }
}

describe("GetInvoiceSpecimenHandler", () => {
  it("rend la facture d'exemple en PDF/A-3 Factur-X, marquée EXEMPLE", async () => {
    const handler = new GetInvoiceSpecimenHandler(new FixedClock(new Date()), new Fonts());

    const pdf = await handler.execute();
    const raw = pdf.bytes.toString("latin1");

    expect(raw.startsWith("%PDF-1.7")).toBe(true);
    expect(raw).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(pdf.fileName).toBe("exemple-facture.pdf");
    expect(drawnUnicodeText(pdf.bytes)).toContain("EXEMPLE");
  });
});
