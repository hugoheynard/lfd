import type { Buffer } from "node:buffer";

import type { DeliveryNoteDrawing } from "../../../channels/commerce/planned-delivery-notes.reader.js";
import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { type DayDossier, dayDossierOf } from "../day-dossier.js";
import { type DossierStamp, dayDossierPdfKey, renderDayDossierPdf } from "../day-dossier-pdf.js";
import { PAPER_LOGO } from "./paper-logo.fixture.js";
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

/**
 * Le rendu, avec le vrai logo et sans BL sauf demande : les specs d'avant
 * l'en-tête (2026-10-25) passaient ces trois-là en position.
 */
function rendered(
  dossier: DayDossier,
  stamp: DossierStamp,
  colisageUrlOf: (reference: string) => string,
  colors: ReadonlyMap<string, string>,
  resupplyColors: ReadonlyMap<string, string>,
  deliveryNotes: ReadonlyMap<string, DeliveryNoteDrawing> = new Map(),
): Promise<Buffer> {
  return renderDayDossierPdf(dossier, stamp, {
    logo: PAPER_LOGO,
    colisageUrlOf,
    colors,
    resupplyColors,
    deliveryNotes,
  });
}

const DOSSIER = dayDossierOf([order("ORD-0002", 4), order("ORD-0001", 6)], new Map());

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
      ...order("ORD-0001", 6),
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
      await rendered(dayDossierOf([frozen], new Map()), STAMP, () => "", NO_COLORS, NO_COLORS),
    );
    const sheet = pages[2] ?? "";
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
    const pages = pdfPages(await rendered(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages[2]).toContain("Client ORD-0001");
    expect(pages[2]).toContain("3 rue du Four");
    expect(pages[2]).not.toContain("NOTE DU CLIENT");
    expect(pages.join("")).not.toMatch(/undefined|null/);
  });

  /**
   * Régression : le pied formatait la clôture en UTC — un arrêt à 0 h 30 heure
   * de Paris imprimait « Arrêté le » de la veille (2026-10-06).
   */
  it("date le pied à l'heure de Paris, pas en UTC", async () => {
    const lateNight = new Date("2026-10-07T22:30:00.000Z");
    const pages = pdfPages(
      await rendered(DOSSIER, { ...STAMP, closedAt: lateNight }, () => "", NO_COLORS, NO_COLORS),
    );
    expect(pages[0]).toContain("Arrêté le jeudi 8 octobre 2026 à 00:30");
  });
});

describe("renderDayDossierPdf", () => {
  it("sort le récapitulatif d'abord, puis un bon par commande, numérotés dans l'ordre", async () => {
    const pages = pdfPages(
      await rendered(
        DOSSIER,
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: null, closedBy: null, retakenByName: null },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain("Dossier de production du jeudi 8 octobre 2026");
    expect(pages[0]).toContain("2 commandes (2 en livraison) · 10 pièces");
    expect(pages[1]).toContain("2 cdes");
    expect(pages[2]).toContain("BON 1/2");
    expect(pages[2]).toContain("ORD-0001");
    expect(pages[2]).toContain("Pour 07:30");
    expect(pages[3]).toContain("BON 2/2");
    expect(pages[3]).toContain("ORD-0002");
    expect(pages.every((page) => page.includes("Arrêté le mercredi 7 octobre 2026"))).toBe(true);
  });

  it("dit le complément après un retirage", async () => {
    const pages = pdfPages(
      await rendered(
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
    const first = await rendered(
      DOSSIER,
      stamp,
      () => "https://admin/colisage/x",
      NO_COLORS,
      NO_COLORS,
    );
    const second = await rendered(
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
    const dossier = dayDossierOf([{ ...order("ORD-0001", 1), lines: many }], new Map());
    const pages = pdfPages(
      await rendered(
        dossier,
        { serviceDay: DAY, closedAt: CLOSED, retakenAt: null, closedBy: null, retakenByName: null },
        () => "",
        NO_COLORS,
        NO_COLORS,
      ),
    );
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[1]).toContain("total à produire (1/");
    // La page de suite entre dans le compte : le pied de la dernière dit N/N.
    const total = String(pages.length);
    expect(pages[2]).toContain(`3/${total}`);
    expect(pages[pages.length - 1]).toContain(`${total}/${total}`);
  });

  it("dit le jour où la marchandise est attendue, en toutes lettres", async () => {
    const pages = pdfPages(await rendered(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages[0]).toContain("Dossier de production du jeudi 8 octobre 2026");
    expect(pages[2]).toContain("LOT POUR LE JEU. 8 OCT. · BON 1/2");
  });

  it("dit qui a arrêté le plan, et qui l'a complété", async () => {
    const byMarie = pdfPages(
      await rendered(
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
      await rendered(
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
      [order("ORD-0001", 4), { ...order("ORD-0002", 6), fulfillmentMethod: "pickup" }],
      new Map(),
    );
    const pages = pdfPages(await rendered(mixed, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages[0]).toContain("2 commandes (1 en retrait, 1 en livraison) · 10 pièces");
  });

  it("numérote chaque page « x/N » dans le pied", async () => {
    const pages = pdfPages(await rendered(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain("1/4");
    expect(pages[1]).toContain("2/4");
    expect(pages[2]).toContain("3/4");
  });
});

describe("dayDossierPdfKey — la version de mise en page", () => {
  it("n'est plus la clé d'avant E1b : un dossier archivé à l'ancien papier n'est jamais resservi", () => {
    expect(dayDossierPdfKey(DAY, null)).not.toBe(`${DAY}/dossier-du-jour.pdf`);
    expect(dayDossierPdfKey(DAY, RETAKEN)).toContain("-v11-retirage-");
  });
});

describe("dayDossierPdfKey", () => {
  it("une clé pour la clôture, une autre par retirage : le complément n'écrase pas l'original", () => {
    const original = dayDossierPdfKey(DAY, null);
    const completed = dayDossierPdfKey(DAY, RETAKEN);
    expect(original).toBe(`${DAY}/dossier-du-jour-v11.pdf`);
    expect(completed).not.toBe(original);
    expect(completed.startsWith(`${DAY}/`)).toBe(true);
  });

  it("compte le réassort sur la fiche de poste, total d'abord, et imprime son bon après les bons de commande", async () => {
    const dossier = dayDossierOf([order("ORD-0001", 6)], new Map(), [
      {
        resupplyId: "r-1",
        siteId: "site-v",
        siteLabel: "Village",
        name: null,
        servedByTransfer: true,
        lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 18 }],
      },
    ]);
    const pages = pdfPages(await rendered(dossier, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain(
      "1 commande (1 en livraison) · 1 réassort · 24 pièces dont 18 de réassort",
    );
    // Le total du rayon, puis sa part de réassort.
    expect(pages[1]).toMatch(/24 pièces\s+dont 18 réassort/);
    expect(pages[0]).not.toContain("RÉASSORT VILLAGE");
    expect(pages[2]).toContain("BON 1/1");
    expect(pages[3]).toContain("RÉASSORT 1/1");
    expect(pages[3]).toContain("Réassort Village");
    expect(pages[3]).toContain("Croissant");
    expect(pages[3]).toContain("18 pièces");
    expect(pages[3]).not.toContain("€");
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
    const pages = pdfPages(await rendered(dossier, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("1 réassort · 18 pièces dont 18 de réassort");
    expect(pages[2]).toContain("Réassort Village");
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
    const pages = pdfPages(await rendered(dossier, STAMP, () => "", NO_COLORS, NO_COLORS));
    // Le tiret long n'est pas relu par `pdf-text` : le nom, puis le point.
    expect(pages[2]).toMatch(/Vitrine du matin .{0,2}Village/);
    expect(pages[2]).not.toContain("Réassort Village");
  });
});

describe("renderDayDossierPdf — la pastille par commande (§0 bis, 2026-10-22)", () => {
  it("pose une pastille sur le bon d'une commande colorée : le papier change, pas son texte", async () => {
    const plain = await rendered(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS);
    const colored = await rendered(
      DOSSIER,
      STAMP,
      () => "",
      new Map([["id-ORD-0001", "#e4572e"]]),
      NO_COLORS,
    );
    expect(colored.equals(plain)).toBe(false);
    expect(pdfPages(colored)).toEqual(pdfPages(plain));
  });

  it("dit l'acheminement en mots derrière la pastille : « Retrait <site> · pro » (Hugo, 2026-10-25)", async () => {
    const dossier = dayDossierOf(
      [
        {
          ...order("ORD-0001", 4),
          fulfillmentMethod: "pickup",
          destination: "Village",
          clientele: "pro",
        },
        { ...order("ORD-0002", 2), clientele: "public" },
      ],
      new Map(),
    );
    const pages = pdfPages(
      await rendered(dossier, STAMP, () => "", new Map([["id-ORD-0001", "#e4572e"]]), NO_COLORS),
    );
    expect(pages[2]).toContain("Retrait Village · pro");
    expect(pages[3]).toContain("Livraison · particulier");
  });

  it("une couleur d'une commande hors du dossier ne pose rien", async () => {
    const plain = await rendered(DOSSIER, STAMP, () => "", NO_COLORS, NO_COLORS);
    const stranger = await rendered(
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
    const plain = await rendered(withResupply, STAMP, () => "", NO_COLORS, NO_COLORS);
    const tinted = await rendered(
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
    const plain = await rendered(withResupply, STAMP, () => "", NO_COLORS, NO_COLORS);
    const stranger = await rendered(
      withResupply,
      STAMP,
      () => "",
      NO_COLORS,
      new Map([["site-ailleurs", "#26a69a"]]),
    );
    expect(stranger.equals(plain)).toBe(true);
  });
});

describe("renderDayDossierPdf — la mise en page du 2026-10-25 (Hugo)", () => {
  const VIENNOISERIES = { id: "fam-vien", name: "Viennoiseries", position: 0 };
  const PAINS = { id: "fam-pain", name: "Pains", position: 1 };
  const SHELVES = new Map([
    ["VIE-001", VIENNOISERIES],
    ["PAI-001", PAINS],
  ]);
  const two = dayDossierOf(
    [
      {
        ...order("ORD-0001", 6),
        fulfillmentMethod: "pickup",
        destination: "Village",
        clientele: "pro",
        lines: [
          { sku: "VIE-001", productName: "Croissant", quantity: 6 },
          { sku: "PAI-001", productName: "Baguette", quantity: 10 },
        ],
      },
      { ...order("ORD-0002", 4), clientele: "public" },
    ],
    SHELVES,
  );

  it("ouvre sur une couverture qui récapitule le lot, les acheminements et les rayons", async () => {
    const [cover] = pdfPages(await rendered(two, STAMP, () => "", NO_COLORS, NO_COLORS));
    for (const text of [
      "Dossier de production du jeudi 8 octobre 2026",
      "2 commandes (1 en retrait, 1 en livraison) · 20 pièces",
      "COMMANDES PAR ACHEMINEMENT",
      "Retrait Village · pro",
      "Livraison · particulier",
      "16 pièces",
      "Viennoiseries",
      "10 pièces",
      "Pains",
    ]) {
      expect(cover).toContain(text);
    }
  });

  it("démarre chaque rayon sur une page, titrée « <rayon> — total à produire »", async () => {
    const pages = pdfPages(await rendered(two, STAMP, () => "", NO_COLORS, NO_COLORS));
    // Le tiret long n'est pas relu par `pdf-text` : le rayon, puis le titre.
    expect(pages[1]).toMatch(/Viennoiseries .{0,2}total à produire/);
    expect(pages[1]).not.toContain("Baguette");
    expect(pages[2]).toMatch(/Pains .{0,2}total à produire/);
    expect(pages[2]).toContain("Baguette");
  });

  it("pose l'en-tête sur chaque page, et ne nomme plus « La Folie Coffee — Fournil »", async () => {
    const pages = pdfPages(await rendered(two, STAMP, () => "", NO_COLORS, NO_COLORS));
    expect(pages.every((page) => page.includes("Lot pour le jeu. 8 oct."))).toBe(true);
    expect(pages.join("")).not.toContain("La Folie Coffee");
  });

  it("une commande qui déborde porte « (1/2) », « (2/2) » dans son titre", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      sku: "VIE-001",
      productName: `Produit ${String(index)}`,
      quantity: 1,
    }));
    const dossier = dayDossierOf([{ ...order("ORD-0001", 1), lines: many }], SHELVES);
    const pages = pdfPages(await rendered(dossier, STAMP, () => "", NO_COLORS, NO_COLORS));
    const sheets = pages.filter((page) => page.includes("Fiche de commande"));
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatch(/ORD-0001 .{0,2}Fiche de commande \(1\/2\)/);
    expect(sheets[1]).toMatch(/ORD-0001 .{0,2}Fiche de commande \(2\/2\)/);
  });

  it("imprime le BL de transport derrière le bon de sa commande, sans l'en-tête du dossier", async () => {
    const bl = (number: string) => (doc: Parameters<DeliveryNoteDrawing>[0]) => {
      doc.font("Helvetica").fontSize(12).text(`BON DE LIVRAISON ${number}`, 40, 60);
    };
    const pages = pdfPages(
      await rendered(
        two,
        STAMP,
        () => "",
        NO_COLORS,
        NO_COLORS,
        new Map([["id-ORD-0001", bl("BL-0001-1")]]),
      ),
    );
    // couverture, deux rayons, bon 1, son BL, bon 2
    expect(pages).toHaveLength(6);
    expect(pages[3]).toContain("BON 1/2");
    expect(pages[4]).toContain("BON DE LIVRAISON BL-0001-1");
    expect(pages[4]).not.toContain("Fiche de commande");
    expect(pages[4]).toContain("5/6");
    expect(pages[5]).toContain("BON 2/2");
  });
});
