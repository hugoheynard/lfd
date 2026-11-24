import { instantToLocal } from "@lfd/contracts";

import type { ProductionOrderSnapshot } from "../../../../day/index.js";
import { PAPER_LOGO } from "../../../../shared/print/domain/services/__tests__/paper-logo.fixture.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import { dayDossierOf } from "../day-dossier.js";
import { type DossierStamp, renderDayDossierPdf } from "../day-dossier-pdf.js";

/**
 * **Le bandeau d'une impression provisoire** : chaque page dit en tête
 * « Provisoire JJ/MM #n hh:mm » et au pied « Provisoire — plan non arrêté »,
 * jamais « Arrêté ». Le jour de service n'est que recopié ; l'instant du
 * tirage est dérivé de maintenant.
 */
const DAY = "2026-10-08";
const PRINTED_AT = new Date();

function order(reference: string): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: `id-${reference}`,
    rank: 1,
    reference,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" }],
  };
}

const STAMP: DossierStamp = {
  serviceDay: DAY,
  closedAt: PRINTED_AT,
  closedBy: null,
  retakenAt: null,
  retakenByName: null,
  printRun: 4,
  provisional: { run: 4, printedAt: PRINTED_AT },
};

async function pages(stamp: DossierStamp): Promise<readonly string[]> {
  const dossier = dayDossierOf(
    [order("ORD-0001"), order("ORD-0002")],
    new Map([["VIE-001", { id: "fam-vien", name: "Viennoiseries", position: 0 }]]),
  );
  return pdfPages(
    await renderDayDossierPdf(dossier, stamp, {
      logo: PAPER_LOGO,
      colisageUrlOf: () => "",
      colors: new Map(),
      resupplyColors: new Map(),
      deliveryNotes: new Map(),
    }),
  );
}

describe("renderDayDossierPdf — une impression provisoire", () => {
  it("porte le bandeau provisoire en tête et au pied de chaque page", async () => {
    const header = `Provisoire 08/10 #4 ${instantToLocal(PRINTED_AT).time}`;
    const all = await pages(STAMP);
    expect(all.length).toBeGreaterThan(1);
    for (const page of all) {
      expect(page).toContain(header);
      // Le tiret cadratin ne survit pas à l'extraction du texte : on lit ses deux bords.
      expect(page).toMatch(/Provisoire\W+plan non arrêté/u);
      expect(page).not.toContain("Arrêté");
      expect(page).not.toContain("Plan du");
    }
  });

  it("sans bandeau, le papier arrêté ne dit jamais « Provisoire »", async () => {
    for (const page of await pages({ ...STAMP, provisional: null })) {
      expect(page).not.toContain("Provisoire");
    }
  });
});
