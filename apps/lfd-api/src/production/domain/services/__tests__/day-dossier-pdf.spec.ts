import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { dayDossierOf } from "../day-dossier.js";
import { dayDossierPdfKey, renderDayDossierPdf } from "../day-dossier-pdf.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";

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
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

const DOSSIER = dayDossierOf([order("LFC-0002", 4), order("LFC-0001", 6)], new Map());

/** Aucune commande colorée : aucune pastille. */
const NO_COLORS: ReadonlyMap<string, string> = new Map();

const STAMP = {
  serviceDay: DAY,
  closedAt: CLOSED,
  retakenAt: null,
  closedBy: null,
  retakenByName: null,
};

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
      await renderDayDossierPdf(
        dayDossierOf([frozen], new Map()),
        STAMP,
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
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
    const pages = pdfPages(
      await renderDayDossierPdf(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS),
    );
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
      await renderDayDossierPdf(
        DOSSIER,
        { ...STAMP, closedAt: lateNight },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(pages[0]).toContain("Arrêté le jeudi 8 octobre 2026 à 00:30");
  });
});

describe("renderDayDossierPdf", () => {
  it("sort le récapitulatif d'abord, puis un bon par commande, numérotés dans l'ordre", async () => {
    const pages = pdfPages(
      await renderDayDossierPdf(
        DOSSIER,
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: null, closedBy: null, retakenByName: null },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("À FABRIQUER");
    expect(pages[0]).toContain("2 commandes (2 en livraison) · 10 pièces");
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
        {
          serviceDay: DAY,
          closedAt: CLOSED,
          retakenAt: RETAKEN,
          closedBy: null,
          retakenByName: null,
        },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(pages[0]).toContain("complété le mercredi 7 octobre 2026");
  });

  it("rend les mêmes octets pour les mêmes entrées — le tirage est reproductible", async () => {
    const stamp = {
      serviceDay: DAY,
      closedAt: CLOSED,
      retakenAt: null,
      closedBy: null,
      retakenByName: null,
    };
    const first = await renderDayDossierPdf(
      DOSSIER,
      stamp,
      () => "https://admin/colisage/x",
      NO_COLORS,
      NO_COLORS,
    );
    const second = await renderDayDossierPdf(
      DOSSIER,
      stamp,
      () => "https://admin/colisage/x",
      NO_COLORS,
      NO_COLORS,
    );
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
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: null, closedBy: null, retakenByName: null },
        () => "",
        NO_COLORS,
        NO_COLORS,
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
    const pages = pdfPages(
      await renderDayDossierPdf(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS),
    );
    expect(pages[0]).toContain("Lot pour le jeudi 8 octobre 2026");
    expect(pages[1]).toContain("LOT POUR LE JEU. 8 OCT. · BON 1/2");
  });

  it("dit qui a arrêté le plan, et qui l'a complété", async () => {
    const byMarie = pdfPages(
      await renderDayDossierPdf(
        DOSSIER,
        {
          ...STAMP,
          closedBy: { kind: "staff", staffUserId: "s-1", name: "Marie Dupont" },
          retakenAt: RETAKEN,
          retakenByName: "Paul Martin",
        },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(byMarie[0]).toContain("Arrêté par Marie Dupont le mercredi 7 octobre 2026");
    expect(byMarie[0]).toContain("complété par Paul Martin le mercredi 7 octobre 2026");
    const automatic = pdfPages(
      await renderDayDossierPdf(
        DOSSIER,
        { ...STAMP, closedBy: { kind: "automatic" } },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(automatic[0]).toContain("Arrêté automatiquement le mercredi 7 octobre 2026");
  });

  it("sépare retrait et livraison dans le compte du lot", async () => {
    const mixed = dayDossierOf(
      [order("LFC-0001", 4), { ...order("LFC-0002", 6), fulfillmentMethod: "pickup" }],
      new Map(),
    );
    const pages = pdfPages(await renderDayDossierPdf(mixed, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages[0]).toContain("2 commandes (1 en retrait, 1 en livraison) · 10 pièces");
  });

  it("numérote chaque page « x/N » dans le pied", async () => {
    const pages = pdfPages(
      await renderDayDossierPdf(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS),
    );
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("1/3");
    expect(pages[1]).toContain("2/3");
    expect(pages[2]).toContain("3/3");
  });
});

describe("dayDossierPdfKey — la version de mise en page", () => {
  it("n'est plus la clé d'avant E1b : un dossier archivé à l'ancien papier n'est jamais resservi", () => {
    expect(dayDossierPdfKey(DAY, null)).not.toBe(`${DAY}/dossier-du-jour.pdf`);
    expect(dayDossierPdfKey(DAY, RETAKEN)).toContain("-v10-retirage-");
  });
});

describe("dayDossierPdfKey", () => {
  it("une clé pour la clôture, une autre par retirage : le complément n'écrase pas l'original", () => {
    const original = dayDossierPdfKey(DAY, null);
    const completed = dayDossierPdfKey(DAY, RETAKEN);
    expect(original).toBe(`${DAY}/dossier-du-jour-v10.pdf`);
    expect(completed).not.toBe(original);
    expect(completed.startsWith(`${DAY}/`)).toBe(true);
  });

  it("compte le réassort sur la fiche de poste, total d'abord, et imprime son bon après les bons de commande", async () => {
    const dossier = dayDossierOf([order("LFC-0001", 6)], new Map(), [
      {
        resupplyId: "r-1",
        siteId: "site-v",
        siteLabel: "Village",
        name: null,
        servedByTransfer: true,
        lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 18 }],
      },
    ]);
    const pages = pdfPages(
      await renderDayDossierPdf(dossier, STAMP, () => "", NO_COLORS, NO_COLORS),
    );
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain(
      "1 commande (1 en livraison) · 1 réassort · 24 pièces dont 18 de réassort",
    );
    // Le tiret long n'est pas relu par `pdf-text` : le total, puis sa part.
    expect(pages[0]).toMatch(/24 .{0,2}dont 18 réassort/);
    expect(pages[0]).not.toContain("RÉASSORT VILLAGE");
    expect(pages[1]).toContain("BON 1/1");
    expect(pages[2]).toContain("RÉASSORT 1/1");
    expect(pages[2]).toContain("Réassort Village");
    expect(pages[2]).toContain("Croissant");
    expect(pages[2]).toContain("18 pièces");
    expect(pages[2]).not.toContain("€");
  });

  it("une journée à réassorts seuls : le récapitulatif, puis le bon de réassort", async () => {
    const dossier = dayDossierOf([], new Map(), [
      {
        resupplyId: "r-1",
        siteId: "site-v",
        siteLabel: "Village",
        name: null,
        servedByTransfer: true,
        lines: [{ sku: "VIE-002", productName: "Pain au chocolat", quantity: 18 }],
      },
    ]);
    const pages = pdfPages(
      await renderDayDossierPdf(dossier, STAMP, () => "", NO_COLORS, NO_COLORS),
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("1 réassort · 18 pièces dont 18 de réassort");
    expect(pages[1]).toContain("Réassort Village");
  });

  it("le bon d'un réassort nommé (R1g) se titre « <nom> — <point> »", async () => {
    const dossier = dayDossierOf([], new Map(), [
      {
        resupplyId: "r-1",
        siteId: "site-v",
        siteLabel: "Village",
        name: "Vitrine du matin",
        servedByTransfer: true,
        lines: [{ sku: "VIE-002", productName: "Pain au chocolat", quantity: 18 }],
      },
    ]);
    const pages = pdfPages(
      await renderDayDossierPdf(dossier, STAMP, () => "", NO_COLORS, NO_COLORS),
    );
    // Le tiret long n'est pas relu par `pdf-text` : le nom, puis le point.
    expect(pages[1]).toMatch(/Vitrine du matin .{0,2}Village/);
    expect(pages[1]).not.toContain("Réassort Village");
  });
});

describe("renderDayDossierPdf — la pastille par commande (§0 bis, 2026-10-22)", () => {
  it("pose une pastille sur le bon d'une commande colorée : le papier change, pas son texte", async () => {
    const plain = await renderDayDossierPdf(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS);
    const colored = await renderDayDossierPdf(
      DOSSIER,
      STAMP,
      () => "",
      new Map([["id-LFC-0001", "#e4572e"]]),
      NO_COLORS,
    );
    expect(colored.equals(plain)).toBe(false);
    expect(pdfPages(colored)).toEqual(pdfPages(plain));
  });

  it("n'écrit ni « Pro » ni « Particulier » : la couleur seule porte la clientèle", async () => {
    const pages = pdfPages(
      await renderDayDossierPdf(
        DOSSIER,
        STAMP,
        () => "",
        new Map([["id-LFC-0001", "#e4572e"]]),
        NO_COLORS,
      ),
    );
    expect(pages.join("")).not.toMatch(/\bPro\b|Particulier/);
  });

  it("une couleur d'une commande hors du dossier ne pose rien", async () => {
    const plain = await renderDayDossierPdf(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS);
    const stranger = await renderDayDossierPdf(
      DOSSIER,
      STAMP,
      () => "",
      new Map([["id-ailleurs", "#e4572e"]]),
      NO_COLORS,
    );
    expect(stranger.equals(plain)).toBe(true);
  });
});

describe("renderDayDossierPdf — la pastille du bon de réassort (Hugo, 2026-10-22)", () => {
  const withResupply = dayDossierOf([], new Map(), [
    {
      resupplyId: "r-1",
      siteId: "site-v",
      siteLabel: "Village",
      name: null,
      servedByTransfer: true,
      lines: [{ sku: "VIE-002", productName: "Pain au chocolat", quantity: 18 }],
    },
  ]);

  it("pose la teinte du site devant le titre : le papier change, pas un mot", async () => {
    const plain = await renderDayDossierPdf(withResupply, STAMP, () => "", NO_COLORS, NO_COLORS);
    const tinted = await renderDayDossierPdf(
      withResupply,
      STAMP,
      () => "",
      NO_COLORS,
      new Map([["site-v", "#26a69a"]]),
    );
    expect(tinted.equals(plain)).toBe(false);
    expect(pdfPages(tinted)).toEqual(pdfPages(plain));
  });

  it("un site sans teinte ne pose rien", async () => {
    const plain = await renderDayDossierPdf(withResupply, STAMP, () => "", NO_COLORS, NO_COLORS);
    const stranger = await renderDayDossierPdf(
      withResupply,
      STAMP,
      () => "",
      NO_COLORS,
      new Map([["site-ailleurs", "#26a69a"]]),
    );
    expect(stranger.equals(plain)).toBe(true);
  });
});
