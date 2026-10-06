import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { type RoundPaper, type RoundPaperSheetStop, windowPaperLabel } from "../round-paper.js";
import { renderRoundPaperPdf, roundPaperFileName } from "../round-paper-pdf.js";

/**
 * **La feuille de tournée en PDF** : ce que le papier dit, page par page.
 *
 * Le jour et l'instant ne sont que recopiés dans l'en-tête, le pied et les
 * métadonnées — rien ne les compare à l'horloge (exception étroite du §5).
 */
const DAY = "2026-10-07";
const PRINTED = new Date("2026-10-07T04:15:00.000Z");

function stop(
  reference: string,
  overrides: Partial<RoundPaperSheetStop> = {},
): RoundPaperSheetStop {
  return {
    kind: "sheet",
    reference,
    customerLabel: `Hôtel ${reference}`,
    addressLines: ["3 rue du Four", "73150 Val d'Isère"],
    window: { start: "07:00", end: "08:30", source: "override" },
    contact: { prenom: "Léa", nom: "Martin", telephone: "06 00 00 00 00" },
    signatureRequired: false,
    binCodes: [],
    steps: [],
    orderNote: "",
    addressNote: null,
    cancelled: false,
    ...overrides,
  };
}

function paper(overrides: Partial<RoundPaper> = {}): RoundPaper {
  return {
    vehicleName: "Kangoo blanc",
    passage: 1,
    serviceDay: DAY,
    driverName: "Paul Durand",
    stops: [stop("LFC-0001"), stop("LFC-0002")],
    printedAt: PRINTED,
    ...overrides,
  };
}

describe("renderRoundPaperPdf — la feuille de tournée", () => {
  it("imprime l'en-tête : tournée, jour long, nombre d'arrêts, livreur", async () => {
    const [first = ""] = pdfPages(await renderRoundPaperPdf(paper({ passage: 2 })));
    expect(first).toContain("Kangoo blanc · passage 2");
    expect(first).toContain("mercredi 7 octobre 2026 · 2 arrêts");
    expect(first).toContain("Livreur : Paul Durand");
  });

  it("dit qu'aucun livreur n'est affecté plutôt que de taire la ligne", async () => {
    const [first = ""] = pdfPages(await renderRoundPaperPdf(paper({ driverName: null })));
    expect(first).toContain("Aucun livreur affecté");
  });

  it("numérote les arrêts « Arrêt i/N » dans l'ordre reçu", async () => {
    const text = pdfPages(
      await renderRoundPaperPdf(paper({ stops: [stop("B-2"), stop("A-1"), stop("C-3")] })),
    ).join("\n");
    const order = ["ARRÊT 1/3", "B-2", "ARRÊT 2/3", "A-1", "ARRÊT 3/3", "C-3"].map((part) =>
      text.indexOf(part),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("imprime adresse, fenêtre, contact, signature, bacs, notes et étapes", async () => {
    const full = stop("LFC-0001", {
      signatureRequired: true,
      binCodes: ["K7Q2", "M3X9"],
      orderNote: "Sonner deux fois",
      addressNote: "Quai de la cour",
      steps: [{ title: "Entrer par la cour", body: "Code 1234" }],
    });
    const [first = ""] = pdfPages(await renderRoundPaperPdf(paper({ stops: [full] })));
    for (const expected of [
      "LFC-0001 · Hôtel LFC-0001",
      "3 rue du Four",
      "73150 Val d'Isère",
      // Le tiret demi-cadratin est l'octet WinAnsi 0x96, que le lecteur latin1
      // du test ne rend pas : les deux bornes suffisent ici, le libellé a son test.
      "7 h 00",
      "8 h 30",
      "Contact : Léa Martin · 06 00 00 00 00",
      "Signature exigée",
      "Bacs : K7Q2 · M3X9",
      "Note de commande : Sonner deux fois",
      "Note de l'adresse : Quai de la cour",
      "1. Entrer par la cour",
      "Code 1234",
    ]) {
      expect(first).toContain(expected);
    }
  });

  it("n'invente rien pour un arrêt absent de la feuille de route", async () => {
    const text = pdfPages(
      await renderRoundPaperPdf(paper({ stops: [{ kind: "absent", orderId: "ord_9" }] })),
    ).join("\n");
    expect(text).toContain("Commande ord_9");
    expect(text).toContain("Absente de la feuille de route du jour");
    expect(text).not.toContain("Contact");
  });

  it("signale une commande annulée", async () => {
    const [first = ""] = pdfPages(
      await renderRoundPaperPdf(paper({ stops: [stop("X-1", { cancelled: true })] })),
    );
    expect(first).toContain("COMMANDE ANNULÉE");
  });

  it("pose « Tiré le … à HH:MM » à l'heure de Paris et « x/N » sur chaque page", async () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      stop(`LFC-${String(index).padStart(4, "0")}`, {
        steps: [{ title: "Étape", body: "Une consigne assez longue pour prendre de la place." }],
      }),
    );
    const pages = pdfPages(await renderRoundPaperPdf(paper({ stops: many })));
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, index) => {
      expect(page).toContain(
        `Tiré le mercredi 7 octobre 2026 à 06:15 · ${String(index + 1)}/${String(pages.length)}`,
      );
    });
    expect(pages.join("\n")).toContain("ARRÊT 30/30");
  });

  it("rend les mêmes octets pour le même papier", async () => {
    const [a, b] = await Promise.all([renderRoundPaperPdf(paper()), renderRoundPaperPdf(paper())]);
    expect(a.equals(b)).toBe(true);
  });

  it("n'imprime aucun montant : ni euro, ni prix", async () => {
    const text = pdfPages(await renderRoundPaperPdf(paper())).join("\n");
    expect(text).not.toMatch(/€|prix|total/iu);
  });
});

describe("libellés du papier", () => {
  it("écrit une échéance sans début « avant », et dit l'horaire par défaut", () => {
    expect(windowPaperLabel({ start: null, end: "10:00", source: "default" })).toBe(
      "avant 10 h 00 (horaire par défaut)",
    );
    expect(windowPaperLabel(null)).toBe("Sans créneau");
  });

  it("nomme le fichier par jour, véhicule et passage", () => {
    expect(roundPaperFileName(paper({ passage: 2 }))).toBe(
      "tournee-2026-10-07-Kangoo blanc-passage-2.pdf",
    );
  });
});
