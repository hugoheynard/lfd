import { BRAND_LOGO } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import {
  type BinLabelSheet,
  type BinLabelsPaper,
  binLabelsFileName,
  renderBinLabelsPdf,
} from "../bin-labels-pdf.js";

// Un instant comparé à rien : il ne fige que les dates du fichier.
const AT = new Date(0);

function label(over: Partial<BinLabelSheet> = {}): BinLabelSheet {
  return {
    reference: "ORD-0042",
    customerLabel: "Le Refuge",
    rank: 1,
    of: 2,
    kind: "Bac M",
    sharedWith: null,
    innerBags: null,
    code: "A3KM7Q",
    qrUrl: "https://admin.test/livraison/bac/b1",
    ...over,
  };
}

function paper(over: Partial<BinLabelsPaper> = {}): BinLabelsPaper {
  return {
    title: "ORD-0042",
    round: { title: "Camion 1", stop: 3 },
    color: "#C2410C",
    labels: [label(), label({ rank: 2, of: 2, code: "R4TB9C" })],
    printedAt: AT,
    ...over,
  };
}

describe("renderBinLabelsPdf", () => {
  it("une feuille par bac : la tournée et l'arrêt, la référence, le rang, le type, le code", async () => {
    const pages = pdfPages(await renderBinLabelsPdf(paper(), BRAND_LOGO));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Camion 1");
    expect(pages[0]).toContain("Arrêt 3");
    expect(pages[0]).toContain("ORD-0042");
    expect(pages[0]).toContain("Le Refuge");
    expect(pages[0]).toContain("Bac 1/2");
    expect(pages[0]).toContain("A3KM7Q");
    expect(pages[1]).toContain("R4TB9C");
  });

  it("dit le partage et les sacs dedans quand il y en a", async () => {
    const shared = label({
      sharedWith: "partagé avec ORD-7 · La Cantine",
      innerBags: "2 sacs dedans",
    });
    const pages = pdfPages(await renderBinLabelsPdf(paper({ labels: [shared] }), BRAND_LOGO));
    expect(pages[0]).toContain("partagé avec ORD-7 · La Cantine");
    expect(pages[0]).toContain("2 sacs dedans");
  });

  it("hors tournée, n'imprime aucun arrêt — jamais un rang qu'on ne connaît pas", async () => {
    const pages = pdfPages(await renderBinLabelsPdf(paper({ round: null }), BRAND_LOGO));
    expect(pages[0]).not.toContain("Arr");
  });

  it("sans origine du back-office, pas de QR, mais le code court reste", async () => {
    const withQr = await renderBinLabelsPdf(paper(), BRAND_LOGO);
    const bare = await renderBinLabelsPdf(
      paper({ labels: [label({ qrUrl: "" }), label({ qrUrl: "", code: "R4TB9C" })] }),
      BRAND_LOGO,
    );
    expect(pdfPages(bare)[0]).toContain("A3KM7Q");
    expect(bare.length).toBeLessThan(withQr.length);
  });

  it("se nomme d'après son titre", () => {
    expect(binLabelsFileName("ORD-0042")).toBe("etiquettes-bacs-ORD-0042.pdf");
  });
});
