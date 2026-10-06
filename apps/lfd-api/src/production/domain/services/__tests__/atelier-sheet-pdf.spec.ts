import { renderProductionCountPdf } from "../atelier-sheet-pdf.js";
import { pdfPages } from "./pdf-text.js";

/** Le compte à produire : la date de son pied. Instant recopié, jamais comparé à l'horloge. */
describe("renderProductionCountPdf", () => {
  /**
   * Régression : « Arrêté le … » formatait `closedAt` en UTC — une clôture après
   * 22 h heure de Paris (été) imprimait la veille (2026-10-06).
   */
  it("une clôture à 0 h 30 heure de Paris est datée de ce jour-là, pas de la veille", async () => {
    const closedAt = new Date("2026-10-06T22:30:00.000Z");
    const pages = pdfPages(
      await renderProductionCountPdf(
        [{ sku: "VIE-001", productName: "Croissant", quantity: 4, done: null }],
        "2026-10-07",
        closedAt,
      ),
    );
    expect(pages[0]).toContain("Arrêté le mercredi 7 octobre 2026");
  });
});
