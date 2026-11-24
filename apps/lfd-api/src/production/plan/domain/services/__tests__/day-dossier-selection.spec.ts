import type { DeliveryNoteDrawing } from "../../../../channels/commerce/planned-delivery-notes.reader.js";
import type { ProductionOrderSnapshot } from "../../../../day/index.js";
import { PAPER_LOGO } from "../../../../shared/print/domain/services/__tests__/paper-logo.fixture.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import { dayDossierOf } from "../day-dossier.js";
import { dossierCalendarOf } from "../day-dossier-calendar.js";
import { type DossierExtract, renderDayDossierPdf } from "../day-dossier-pdf.js";
import {
  type DossierPart,
  type DossierSelection,
  WHOLE_DOSSIER,
  isWholeDossier,
  selectedOrders,
  selectedRecap,
  selectionNotice,
} from "../day-dossier-selection.js";
import { DossierSelectionUnknownError } from "../../errors/dossier-selection-errors.js";

/**
 * **Un tirage partiel du dossier** : les mêmes dessins, moins de pages.
 *
 * Les instants ne sont que recopiés dans le pied — rien ne les compare à
 * l'horloge (exception étroite du §5).
 */
const DAY = "2026-10-08";
const STAMP = {
  serviceDay: DAY,
  closedAt: new Date("2026-10-07T18:00:00.000Z"),
  retakenAt: null,
  closedBy: null,
  retakenByName: null,
  printRun: 1,
};
const SHELVES = new Map([
  ["VIE-001", { id: "fam-vien", name: "Viennoiseries", position: 0 }],
  ["PAI-001", { id: "fam-pain", name: "Pains", position: 1 }],
]);

function order(reference: string, sku: string, quantity: number): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: `id-${reference}`,
    rank: 1,
    reference,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: "delivery",
    destination: "3 rue du Four",
    dueAt: "07:30",
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku, productName: sku, quantity, saleUnit: "piece" }],
  };
}

const ORDERS = [order("ORD-0001", "VIE-001", 6), order("ORD-0002", "PAI-001", 4)];
const DOSSIER = dayDossierOf(ORDERS, SHELVES);
const BL: DeliveryNoteDrawing = (doc) => {
  doc.font("Helvetica").fontSize(12).text("BON DE LIVRAISON BL-0001-1", 40, 60);
};

function selection(partial: Partial<DossierSelection>): DossierSelection {
  return { ...WHOLE_DOSSIER, ...partial };
}

function parts(...only: DossierPart[]): ReadonlySet<DossierPart> {
  return new Set(only);
}

async function pagesOf(
  extract: DossierExtract,
  dossier = DOSSIER,
  calendar = dossierCalendarOf(
    DOSSIER.recap,
    new Map([
      ["VIE-001", [{ kind: "deadline" as const, before: "05:00", quantity: 6, cumulative: 6 }]],
    ]),
  ),
): Promise<readonly string[]> {
  const pdf = await renderDayDossierPdf(
    dossier,
    STAMP,
    {
      logo: PAPER_LOGO,
      colisageUrlOf: () => "",
      colors: new Map(),
      resupplyColors: new Map(),
      deliveryNotes: new Map([["id-ORD-0001", BL]]),
    },
    calendar,
    extract,
  );
  return pdfPages(pdf);
}

describe("la sélection d'un tirage du dossier", () => {
  it("ne dit le dossier entier que si tout y est", () => {
    expect(isWholeDossier(WHOLE_DOSSIER)).toBe(true);
    expect(isWholeDossier(selection({ parts: parts("cover") }))).toBe(false);
    expect(isWholeDossier(selection({ groups: new Set(["Pains"]) }))).toBe(false);
    expect(isWholeDossier(selection({ orders: new Set(["id-ORD-0001"]) }))).toBe(false);
  });

  it("garde les commandes choisies, et refuse une commande absente de la journée", () => {
    const chosen = selection({ orders: new Set(["id-ORD-0002"]) });
    expect(selectedOrders(ORDERS, chosen).map((o) => o.reference)).toEqual(["ORD-0002"]);
    expect(() => selectedOrders(ORDERS, selection({ orders: new Set(["id-ORD-9999"]) }))).toThrow(
      DossierSelectionUnknownError,
    );
  });

  it("garde les rayons choisis, et refuse un rayon absent du dossier", () => {
    const chosen = selection({ groups: new Set(["Pains"]) });
    expect(selectedRecap(DOSSIER.recap, chosen).map((g) => g.label)).toEqual(["Pains"]);
    expect(() => selectedRecap(DOSSIER.recap, selection({ groups: new Set(["Gâteaux"]) }))).toThrow(
      DossierSelectionUnknownError,
    );
  });

  it("ne mentionne une sélection que si des commandes manquent", () => {
    expect(selectionNotice(14, 14)).toBeNull();
    expect(selectionNotice(3, 14)).toBe("sélection : 3 commandes sur 14");
    expect(selectionNotice(1, 14)).toBe("sélection : 1 commande sur 14");
  });
});

describe("renderDayDossierPdf — un tirage partiel", () => {
  it("sans sélection, rend le dossier entier, octet pour octet", async () => {
    const calendar = dossierCalendarOf(DOSSIER.recap, new Map());
    const print = {
      logo: PAPER_LOGO,
      colisageUrlOf: () => "",
      colors: new Map(),
      resupplyColors: new Map(),
      deliveryNotes: new Map(),
    };
    const implicit = await renderDayDossierPdf(DOSSIER, STAMP, print, calendar);
    const explicit = await renderDayDossierPdf(DOSSIER, STAMP, print, calendar, {
      selection: WHOLE_DOSSIER,
      notice: null,
    });
    expect(implicit.equals(explicit)).toBe(true);
  });

  it("ne tire que les fiches de commande, sans leur BL, et compte ses propres pages", async () => {
    const pages = await pagesOf({ selection: selection({ parts: parts("orders") }), notice: null });
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("BON 1/2");
    expect(pages[1]).toContain("BON 2/2");
    expect(pages.join("")).not.toContain("BON DE LIVRAISON");
    expect(pages[1]).toContain("2/2");
  });

  it("ne tire que les BL, sans les fiches", async () => {
    const pages = await pagesOf({
      selection: selection({ parts: parts("deliveryNotes") }),
      notice: null,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("BON DE LIVRAISON BL-0001-1");
  });

  it("ne tire que le total et le calendrier d'un rayon choisi", async () => {
    const pages = await pagesOf({
      selection: selection({
        parts: parts("recap", "calendar"),
        groups: new Set(["Viennoiseries"]),
      }),
      notice: null,
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Viennoiseries");
    expect(pages[0]).toContain("total à produire");
    expect(pages[1]).toContain("par tranche horaire");
    expect(pages.join("")).not.toContain("Pains");
  });

  it("sépare le total d'un rayon de son calendrier", async () => {
    const recapOnly = await pagesOf({
      selection: selection({ parts: parts("recap") }),
      notice: null,
    });
    expect(recapOnly).toHaveLength(2);
    expect(recapOnly.join("")).not.toContain("par tranche horaire");
    const calendarOnly = await pagesOf({
      selection: selection({ parts: parts("calendar") }),
      notice: null,
    });
    const text = calendarOnly.join("");
    expect(text.match(/par tranche horaire/gu)).toHaveLength(2);
    expect(text).not.toContain("total à produire");
  });

  it("dit la sélection en en-tête, et compte la couverture sur les commandes choisies", async () => {
    const chosen = selection({ orders: new Set(["id-ORD-0002"]) });
    const dossier = dayDossierOf(selectedOrders(ORDERS, chosen), SHELVES);
    const pages = await pagesOf(
      { selection: selection({ parts: parts("cover", "recap") }), notice: selectionNotice(1, 2) },
      dossier,
      [],
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("1 commande");
    expect(pages[0]).not.toContain("2 commandes");
    expect(pages.every((page) => page.includes("sélection : 1 commande sur 2"))).toBe(true);
  });
});
