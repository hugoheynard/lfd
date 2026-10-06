import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { dayDossierOf } from "../day-dossier.js";
import { dayDossierPdfKey, renderDayDossierPdf } from "../day-dossier-pdf.js";
import { pdfPages } from "./pdf-text.js";

/**
 * **Le dossier du jour, en PDF** : ce que le papier dit, page par page.
 *
 * Les instants ne sont que recopiés dans le pied et les métadonnées — rien ne
 * les compare à l'horloge (exception étroite du §5).
 */
const DAY = "2026-10-08";
const CLOSED = new Date("2026-10-07T18:00:00.000Z");
const RETAKEN = new Date("2026-10-07T21:30:00.000Z");

function order(reference: string, quantity: number): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: `id-${reference}`,
    reference,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: "delivery",
    destination: "3 rue du Four",
    dueAt: "07:30",
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

const DOSSIER = dayDossierOf([order("LFC-0002", 4), order("LFC-0001", 6)], new Map());

const STAMP = { serviceDay: DAY, closedAt: CLOSED, retakenAt: null };

describe("renderDayDossierPdf — le bon figé à l'arrêt (E1b)", () => {
  it("imprime l'enseigne, la raison sociale, l'adresse, la fenêtre, le contact, la signature, l'origine et la note", async () => {
    const frozen: ProductionOrderSnapshot = {
      ...order("LFC-0001", 6),
      sheetDetails: {
        tradeName: "Hôtel des Trois Ponts",
        legalName: "SAS Trois Ponts",
        pickupLabel: null,
        address: { line1: "3 rue du Four", line2: "", postalCode: "73150", city: "Val d'Isère" },
        window: { start: "07:00", end: "08:30" },
        contact: { source: "order", name: "Léa Martin", phone: "0600000000" },
        signatureRequired: true,
        note: "Sonner deux fois",
        recurring: true,
      },
    };
    const pages = pdfPages(
      await renderDayDossierPdf(dayDossierOf([frozen], new Map()), STAMP, () => ""),
    );
    const sheet = pages[1] ?? "";
    for (const text of [
      "Hôtel des Trois Ponts",
      "SAS Trois Ponts",
      "3 rue du Four",
      "73150 Val d'Isère",
      // Le tiret de la fenêtre n'est pas relu par `pdf-text` (hors ASCII, comme
      // celui du pied) : les deux bornes suffisent.
      "7 h 00",
      "8 h 30",
      "Léa Martin · 0600000000",
      "Signature exigée à la remise",
      "Panier récurrent",
      "NOTE DU CLIENT",
      "Sonner deux fois",
    ]) {
      expect(sheet).toContain(text);
    }
  });

  it("une journée arrêtée avant le lot garde le rendu d'avant, sans « undefined » ni « null »", async () => {
    const pages = pdfPages(await renderDayDossierPdf(DOSSIER, STAMP, () => ""));
    expect(pages[1]).toContain("Client LFC-0001");
    expect(pages[1]).toContain("3 rue du Four");
    expect(pages[1]).not.toContain("NOTE DU CLIENT");
    expect(pages.join("")).not.toMatch(/undefined|null/);
  });

  /**
   * Régression : le pied formatait la clôture en UTC — un arrêt à 0 h 30 heure
   * de Paris imprimait « Arrêté le » de la veille (2026-10-06).
   */
  it("date le pied à l'heure de Paris, pas en UTC", async () => {
    const lateNight = new Date("2026-10-07T22:30:00.000Z");
    const pages = pdfPages(
      await renderDayDossierPdf(DOSSIER, { ...STAMP, closedAt: lateNight }, () => ""),
    );
    expect(pages[0]).toContain("Arrêté le jeudi 8 octobre 2026 à 00:30");
  });
});

describe("renderDayDossierPdf", () => {
  it("sort le récapitulatif d'abord, puis un bon par commande, numérotés dans l'ordre", async () => {
    const pages = pdfPages(
      await renderDayDossierPdf(
        DOSSIER,
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: null },
        () => "",
      ),
    );
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("À FABRIQUER");
    expect(pages[0]).toContain("2 commandes · 10 pièces");
    expect(pages[0]).toContain("2 cdes");
    expect(pages[1]).toContain("BON 1/2");
    expect(pages[1]).toContain("LFC-0001");
    expect(pages[1]).toContain("Pour 07:30");
    expect(pages[2]).toContain("BON 2/2");
    expect(pages[2]).toContain("LFC-0002");
    expect(pages.every((page) => page.includes("Arrêté le mercredi 7 octobre 2026"))).toBe(true);
  });

  it("dit le complément après un retirage", async () => {
    const pages = pdfPages(
      await renderDayDossierPdf(
        DOSSIER,
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: RETAKEN },
        () => "",
      ),
    );
    expect(pages[0]).toContain("complété le mercredi 7 octobre 2026");
  });

  it("rend les mêmes octets pour les mêmes entrées — le tirage est reproductible", async () => {
    const stamp = { serviceDay: DAY, closedAt: CLOSED, retakenAt: null };
    const first = await renderDayDossierPdf(DOSSIER, stamp, () => "https://admin/colisage/x");
    const second = await renderDayDossierPdf(DOSSIER, stamp, () => "https://admin/colisage/x");
    expect(first.equals(second)).toBe(true);
  });

  it("tourne la page d'un récapitulatif trop long plutôt que d'écrire sur le pied", async () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      sku: `SKU-${String(index).padStart(3, "0")}`,
      productName: `Produit ${String(index)}`,
      quantity: 1,
    }));
    const dossier = dayDossierOf([{ ...order("LFC-0001", 1), lines: many }], new Map());
    const pages = pdfPages(
      await renderDayDossierPdf(
        dossier,
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: null },
        () => "",
      ),
    );
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[1]).toContain("SUITE");
    // La page SUITE entre dans le compte : le pied de la dernière dit N/N.
    const total = String(pages.length);
    expect(pages[1]).toContain(`2/${total}`);
    expect(pages[pages.length - 1]).toContain(`${total}/${total}`);
  });

  it("dit le jour où la marchandise est attendue, en toutes lettres", async () => {
    const pages = pdfPages(await renderDayDossierPdf(DOSSIER, STAMP, () => ""));
    expect(pages[0]).toContain("Lot pour le jeudi 8 octobre 2026");
    expect(pages[1]).toContain("LOT POUR LE JEU. 8 OCT. · BON 1/2");
  });

  it("numérote chaque page « x/N » dans le pied", async () => {
    const pages = pdfPages(await renderDayDossierPdf(DOSSIER, STAMP, () => ""));
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("1/3");
    expect(pages[1]).toContain("2/3");
    expect(pages[2]).toContain("3/3");
  });
});

describe("dayDossierPdfKey — la version de mise en page", () => {
  it("n'est plus la clé d'avant E1b : un dossier archivé à l'ancien papier n'est jamais resservi", () => {
    expect(dayDossierPdfKey(DAY, null)).not.toBe(`${DAY}/dossier-du-jour.pdf`);
    expect(dayDossierPdfKey(DAY, RETAKEN)).toContain("-v3-retirage-");
  });
});

describe("dayDossierPdfKey", () => {
  it("une clé pour la clôture, une autre par retirage : le complément n'écrase pas l'original", () => {
    const original = dayDossierPdfKey(DAY, null);
    const completed = dayDossierPdfKey(DAY, RETAKEN);
    expect(original).toBe(`${DAY}/dossier-du-jour-v3.pdf`);
    expect(completed).not.toBe(original);
    expect(completed.startsWith(`${DAY}/`)).toBe(true);
  });
});
