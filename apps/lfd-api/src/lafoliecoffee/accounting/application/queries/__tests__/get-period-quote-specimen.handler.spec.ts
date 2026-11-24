import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  type InvoicePdfFonts,
  InvoiceFontSource,
} from "../../../domain/ports/invoice-font-source.js";
import { TEST_FONTS } from "../../../domain/services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../../../domain/services/__tests__/pdf-objects.js";
import { GetPeriodQuoteSpecimenHandler } from "../get-period-quote-specimen.handler.js";

/** Les vraies polices, servies par un double du port. */
class Fonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.resolve(TEST_FONTS);
  }
}

/** Le jour de l'exemple : une donnée, le devis n'est comparé à aucune horloge. */
const NOW = new Date("2026-11-03T09:00:00.000Z");

describe("GetPeriodQuoteSpecimenHandler", () => {
  it("rend le devis d'exemple : un PDF ordinaire, marqué EXEMPLE, avec ses mentions", async () => {
    const handler = new GetPeriodQuoteSpecimenHandler(new FixedClock(NOW), new Fonts());

    const pdf = await handler.execute();
    const raw = pdf.bytes.toString("latin1");
    const printed = drawnUnicodeText(pdf.bytes);

    expect(raw.startsWith("%PDF-1.7")).toBe(true);
    expect(raw).not.toContain("pdfaid:part");
    expect(raw).not.toContain("factur-x.xml");
    expect(pdf.fileName).toBe("exemple-D-20261102-999-v2.pdf");
    for (const expected of [
      "EXEMPLE",
      "Devis — ceci n'est pas une facture",
      "N° D-20261102-999",
      "Version 2",
      "Période du 27/10/2026 au 02/11/2026",
      "Code service : EXEMPLE-SERV",
      "la mercuriale « EXEMPLE — Tarif convenu de la caserne »",
      "À retourner avec votre numéro d'engagement",
    ]) {
      expect(printed).toContain(expected);
    }
  });
});
