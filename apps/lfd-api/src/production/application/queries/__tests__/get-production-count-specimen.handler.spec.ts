import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { FixedPaperLogo } from "../../__tests__/paper-doubles.js";
import { GetProductionCountSpecimenHandler } from "../get-production-count-specimen.handler.js";

const clock = new FixedClock(new Date());

describe("GetProductionCountSpecimenHandler", () => {
  it("rend le compte à produire d'exemple : commandes et réassort additionnés, aucun montant", async () => {
    const pdf = await new GetProductionCountSpecimenHandler(clock, new FixedPaperLogo()).execute();
    const text = pdfPages(pdf.bytes).join(" ");

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe("exemple-compte-a-produire.pdf");
    expect(text).toContain("Compte à produire");
    expect(text).toContain("Croissant pur beurre");
    // 40+12+15 baguettes, 60+18+20 croissants, 30+24, 6, 2 → 5 articles, 227 pièces.
    // Le saumon de l'exemple est au poids (P6) : il compte pour une pièce.
    expect(text).toContain("6 articles, 228 pièces");
    expect(text).toContain("1,25 kg");
    expect(text).not.toContain("€");
  });
});
