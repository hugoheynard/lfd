import { FixedBrandLogo } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { AppConfig } from "../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GetBagLabelSpecimenHandler } from "../get-bag-label-specimen.handler.js";

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

describe("GetBagLabelSpecimenHandler", () => {
  it("rend l'étiquette de sac d'exemple : deux sacs, deux feuilles", async () => {
    const file = await new GetBagLabelSpecimenHandler(
      new FixedClock(new Date(0)),
      new AdminOrigin("https://admin.lfc.test"),
      new FixedBrandLogo(),
    ).execute();
    const pages = pdfPages(file.bytes);
    expect(file.fileName).toBe("exemple-etiquette-de-sac.pdf");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("ORD-0123");
    expect(pages[1]).toContain("Sac 2/2");
  });
});
