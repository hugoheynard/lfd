import { addDays, instantToLocal } from "@lfd/contracts";

import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { specimenRoundPaper } from "../../document-specimens/specimen-data.js";
import { GetRoundPaperSpecimenHandler } from "../get-round-paper-specimen.handler.js";

/** La feuille de tournée d'exemple, rendue par le rendu des vraies tournées. */
const NOW = new Date();

describe("GetRoundPaperSpecimenHandler", () => {
  it("rend la feuille d'exemple : le véhicule, les arrêts, aucun montant", async () => {
    const pdf = await new GetRoundPaperSpecimenHandler(new FixedClock(NOW)).execute();
    const text = pdfPages(pdf.bytes).join(" ");

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe("exemple-feuille-de-tournee.pdf");
    // Le tiret cadratin sort du texte extrait (WinAnsi), comme sur les vraies feuilles.
    expect(text).toContain("Kangoo blanc");
    expect(text).toContain("EXEMPLE");
    expect(text).toContain("EXEMPLE-0001");
    expect(text).not.toContain("€");
  });

  it("est tirée maintenant, pour le lendemain, avec un horaire prévu", () => {
    const paper = specimenRoundPaper(NOW);

    expect(paper.printedAt).toBe(NOW);
    expect(paper.serviceDay).toBe(addDays(instantToLocal(NOW).day, 1));
    expect(paper.planned).not.toBeNull();
    expect(paper.stops.some((stop) => stop.kind === "sheet" && stop.signatureRequired)).toBe(true);
  });
});
