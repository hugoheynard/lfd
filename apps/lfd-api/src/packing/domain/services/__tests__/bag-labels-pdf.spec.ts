import type { PackingBagLabelsView } from "@lfd/contracts";

import { BRAND_LOGO } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { bagLabelsFileName, renderBagLabelsPdf } from "../bag-labels-pdf.js";

// Un instant comparé à rien : il ne fige que les dates du fichier.
const PRINT = { printedAt: new Date(0), logo: BRAND_LOGO };

function labels(over: Partial<PackingBagLabelsView> = {}): PackingBagLabelsView {
  return {
    orderId: "ord_1",
    reference: "ORD-0042",
    customerLabel: "Le Bistrot",
    fulfillmentLabel: "Retrait Village · pro",
    when: "avant 10 h 00",
    color: "#123456",
    handoverUrl: "https://admin.test/retrait/t",
    bags: [
      { containerId: "c1", label: "Sac 1", rank: 1, of: 3 },
      { containerId: "c2", label: "Sac 2", rank: 2, of: 3 },
      { containerId: "c3", label: "Sac 4", rank: 3, of: 3 },
    ],
    ...over,
  };
}

describe("renderBagLabelsPdf", () => {
  it("une feuille par sac, avec la référence, le client, l'acheminement, le créneau et « Sac n/N »", async () => {
    const view = labels();
    const pages = pdfPages(await renderBagLabelsPdf(view, view.bags, PRINT));
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(page).toContain("ORD-0042");
      expect(page).toContain("Le Bistrot");
      expect(page).toContain("Retrait Village · pro");
      expect(page).toContain("avant 10 h 00");
    }
    expect(pages.map((page) => /Sac \d\/\d/u.exec(page)?.[0])).toEqual([
      "Sac 1/3",
      "Sac 2/3",
      "Sac 3/3",
    ]);
  });

  it("réimprimer un sac seul garde son rang dans la commande", async () => {
    const view = labels();
    const pages = pdfPages(await renderBagLabelsPdf(view, view.bags.slice(1, 2), PRINT));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Sac 2/3");
  });

  it("un sac unique ne dit pas « Sac 1/1 »", async () => {
    const view = labels({ bags: [{ containerId: "c1", label: "Sac 1", rank: 1, of: 1 }] });
    const pages = pdfPages(await renderBagLabelsPdf(view, view.bags, PRINT));
    expect(pages[0]).not.toContain("Sac 1/1");
  });

  it("sans QR ni couleur, l'étiquette s'imprime quand même — et autrement", async () => {
    const view = labels();
    const bare = labels({ color: null, handoverUrl: "" });
    const full = await renderBagLabelsPdf(view, view.bags, PRINT);
    const plain = await renderBagLabelsPdf(bare, bare.bags, PRINT);
    expect(pdfPages(plain)).toHaveLength(3);
    expect(plain.length).toBeLessThan(full.length);
  });

  it("se nomme d'après la référence", () => {
    expect(bagLabelsFileName("ORD-0042")).toBe("etiquettes-sacs-ORD-0042.pdf");
  });
});
