import { AppConfig } from "../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { FixedPaperLogo } from "../../__tests__/paper-doubles.js";
import { GetAtelierSheetSpecimenHandler } from "../get-atelier-sheet-specimen.handler.js";

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

describe("GetAtelierSheetSpecimenHandler", () => {
  it("rend la fiche d'atelier d'exemple : la référence, le client, aucun montant", async () => {
    const pdf = await new GetAtelierSheetSpecimenHandler(
      clock,
      new AdminOrigin(null),
      new FixedPaperLogo(),
    ).execute();
    const text = pdfPages(pdf.bytes).join(" ");

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe("exemple-fiche-atelier.pdf");
    expect(text).toContain("EXEMPLE-0001");
    expect(text).toContain("Baguette tradition");
    expect(text).toContain("EXEMPLE-0001 // Fiche de préparation");
    expect(text).not.toContain("€");
  });

  it("imprime le QR de colisage quand l'origine du back-office est connue", async () => {
    const plain = await new GetAtelierSheetSpecimenHandler(
      clock,
      new AdminOrigin(null),
      new FixedPaperLogo(),
    ).execute();
    const withQr = await new GetAtelierSheetSpecimenHandler(
      clock,
      new AdminOrigin("https://admin.lfc.test"),
      new FixedPaperLogo(),
    ).execute();

    expect(withQr.bytes.equals(plain.bytes)).toBe(false);
  });
});
