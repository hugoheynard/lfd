import { pdfPages } from "../../../../../../platform/pdf/__tests__/pdf-text.js";
import {
  COUNT_LAYOUT_VERSION,
  productionCountPdfKey,
  renderProductionCountPdf,
} from "../atelier-sheet-pdf.js";
import { PAPER_LOGO } from "./paper-logo.fixture.js";

/**
 * La clé du compte à produire par version du plan
 * (`les-versions-du-plan.md`). Dates recopiées dans un nom,
 * jamais comparées à l'horloge (§5).
 */
const DAY = "2026-11-28";
const CLOSED = new Date("2026-11-27T18:00:00.000Z");
const RETAKEN = new Date("2026-11-27T19:10:00.000Z");

describe("productionCountPdfKey — par version", () => {
  it("une journée versionnée se range sous sa version, dans la mise en page courante", () => {
    expect(productionCountPdfKey(DAY, CLOSED, RETAKEN, 4)).toBe(
      `${DAY}/compte-a-produire-${COUNT_LAYOUT_VERSION}-version-4.pdf`,
    );
  });

  it("une journée sans version garde la clé par tirage d'avant, que les comptes rangés gardent", () => {
    expect(productionCountPdfKey(DAY, CLOSED, null, null)).toBe(
      `${DAY}/compte-a-produire-v2-arret-2026-11-27T18-00-00-000Z.pdf`,
    );
    expect(productionCountPdfKey(DAY, CLOSED, RETAKEN)).toBe(
      `${DAY}/compte-a-produire-v2-arret-2026-11-27T18-00-00-000Z-retirage-2026-11-27T19-10-00-000Z.pdf`,
    );
  });
});

describe("renderProductionCountPdf — la version en tête (§ 1.15)", () => {
  const ITEMS = [
    {
      sku: "VIE-001",
      productName: "Croissant",
      quantity: 4,
      madeToOrder: false,
      saleUnit: "piece",
    },
  ] as const;

  it("dit la version du plan qu'il compte", async () => {
    const [page] = pdfPages(
      await renderProductionCountPdf(
        ITEMS,
        { serviceDay: DAY, closedAt: CLOSED, logo: PAPER_LOGO, planVersion: 4 },
        [],
      ),
    );
    expect(page).toContain("Version 4");
  });

  it("sans version, l'en-tête d'avant", async () => {
    const [page] = pdfPages(
      await renderProductionCountPdf(
        ITEMS,
        { serviceDay: DAY, closedAt: CLOSED, logo: PAPER_LOGO },
        [],
      ),
    );
    expect(page).not.toContain("Version");
  });
});
