import { FixedBrandLogo } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { AppConfig } from "../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GetBinLabelSpecimenHandler } from "../get-bin-label-specimen.handler.js";

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

describe("GetBinLabelSpecimenHandler", () => {
  it("rend l'étiquette de bac d'exemple : un bac entier, une moitié partagée", async () => {
    const file = await new GetBinLabelSpecimenHandler(
      new FixedClock(new Date(0)),
      new AdminOrigin(null),
      new FixedBrandLogo(),
    ).execute();
    const pages = pdfPages(file.bytes);
    expect(file.fileName).toBe("exemple-etiquette-de-bac.pdf");
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("partagé avec");
  });
});
