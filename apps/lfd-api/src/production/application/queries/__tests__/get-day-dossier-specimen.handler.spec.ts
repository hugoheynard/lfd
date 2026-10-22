import { AppConfig } from "../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GetDayDossierSpecimenHandler } from "../get-day-dossier-specimen.handler.js";

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

const clock = new FixedClock(new Date());

describe("GetDayDossierSpecimenHandler", () => {
  it("rend le dossier d'exemple : récapitulatif, trois bons de commande, un bon de réassort", async () => {
    const pdf = await new GetDayDossierSpecimenHandler(clock, new AdminOrigin(null)).execute();
    const pages = pdfPages(pdf.bytes);
    const text = pages.join(" ");

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe("exemple-dossier-du-jour.pdf");
    expect(text).toContain("EXEMPLE-0001");
    expect(text).toContain("EXEMPLE-0003");
    expect(text).toContain("BON 3/3");
    expect(text).toContain("RÉASSORT 1/1");
    expect(text).toContain("VIENNOISERIES");
    expect(text).not.toContain("€");
  });

  it("imprime les QR de colisage quand l'origine du back-office est connue", async () => {
    const plain = await new GetDayDossierSpecimenHandler(clock, new AdminOrigin(null)).execute();
    const withQr = await new GetDayDossierSpecimenHandler(
      clock,
      new AdminOrigin("https://admin.lfc.test"),
    ).execute();

    expect(withQr.bytes.equals(plain.bytes)).toBe(false);
  });
});
