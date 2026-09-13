import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { ProducedItemSnapshot } from "../../entities/production-day.js";
import {
  worksheetOf,
  type ContainerRule,
  type DemandedItem,
  type WorksheetSources,
} from "../production-worksheet.js";

/**
 * ⚠️ Ces instants sont **absolus**, et c'est l'exception étroite du §5 : rien
 * ici ne les compare à l'horloge. `worksheetOf` est une fonction pure qui les
 * recopie — elle ne sait même pas quel jour on est. Ils ne sont comparés qu'à
 * eux-mêmes.
 */
const TIRAGE = new Date("2026-09-13T04:20:00.000Z");
const RETIRAGE = new Date("2026-09-13T06:20:00.000Z");
const SORTIE_DU_FOUR = new Date("2026-09-13T05:10:00.000Z");

const TOURNEUSE: ContainerRule = {
  unitsPerContainer: 10,
  singular: "tourneuse",
  plural: "tourneuses",
};

/** Une ligne du compte à produire, faite ou non. */
function count(
  sku: string,
  productName: string,
  quantity: number,
  initials: string | null = null,
): ProducedItemSnapshot {
  return {
    sku,
    productName,
    quantity,
    done: initials === null ? null : { at: SORTIE_DU_FOUR, by: "staff-1", initials },
  };
}

function demanded(sku: string, productName: string, quantity: number): DemandedItem {
  return { sku, productName, quantity };
}

/** Une commande arrivée après le tirage — la matière de l'écart. */
function arrival(orderId: string, lines: readonly [string, string, number][]): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    lines: lines.map(([sku, productName, quantity]) => ({ sku, productName, quantity })),
  };
}

/** Les sources, avec le minimum plausible — chaque cas ne pose que ce qu'il éprouve. */
function sources(overrides: Partial<WorksheetSources> = {}): WorksheetSources {
  return {
    closedAt: null,
    retakenAt: null,
    counts: [],
    demand: [],
    arrivals: [],
    containers: new Map(),
    ...overrides,
  };
}

describe("worksheetOf — la journée OUVERTE", () => {
  it("sert la demande du commerce, sans heure de tirage ni écart", () => {
    const sheet = worksheetOf(sources({ demand: [demanded("PAI-SEI", "Pain de seigle", 30)] }));

    expect(sheet.generatedAt).toBeNull();
    expect(sheet.retakenAt).toBeNull();
    expect(sheet.drift).toBeNull();
    expect(sheet.lines).toHaveLength(1);
    expect(sheet.lines[0]).toMatchObject({ sku: "PAI-SEI", quantity: 30, done: false });
  });

  it("ignore l'instantané tant que rien n'est arrêté", () => {
    // Le cas tordu que l'arbitrage doit trancher : une journée peut porter un
    // compte écrit puis rouvert. C'est `closedAt` qui décide, pas la présence
    // de lignes.
    const sheet = worksheetOf(
      sources({
        counts: [count("PAI-SEI", "Pain de seigle", 99)],
        demand: [demanded("PAI-SEI", "Pain de seigle", 30)],
      }),
    );

    expect(sheet.lines).toHaveLength(1);
    expect(sheet.lines[0]?.quantity).toBe(30);
  });

  it("n'annonce AUCUN écart, même quand des commandes sont arrivées", () => {
    // Ce qui n'est pas figé ne peut pas être périmé : un bandeau ici demanderait
    // d'absorber dans un plan qui n'existe pas.
    const sheet = worksheetOf(
      sources({
        demand: [demanded("PAI-SEI", "Pain de seigle", 30)],
        arrivals: [arrival("ord_1", [["PAI-SEI", "Pain de seigle", 12]])],
      }),
    );

    expect(sheet.drift).toBeNull();
  });

  it("aucune ligne n'est cochée : une demande n'a personne pour la cocher", () => {
    const sheet = worksheetOf(sources({ demand: [demanded("VIE-CRO", "Croissant", 40)] }));

    expect(sheet.lines[0]).toMatchObject({ done: false, initials: null, doneAt: null });
  });
});

describe("worksheetOf — la journée ARRÊTÉE", () => {
  it("sert l'instantané, son heure de tirage et celle du dernier retirage", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        retakenAt: RETIRAGE,
        counts: [count("PAI-SEI", "Pain de seigle", 42)],
        demand: [demanded("PAI-SEI", "Pain de seigle", 30)],
      }),
    );

    expect(sheet.generatedAt).toBe(TIRAGE);
    expect(sheet.retakenAt).toBe(RETIRAGE);
    expect(sheet.lines).toHaveLength(1);
    expect(sheet.lines[0]?.quantity).toBe(42);
  });

  it("rend la coche, ses initiales et son heure", () => {
    const sheet = worksheetOf(
      sources({ closedAt: TIRAGE, counts: [count("PAI-SEI", "Pain de seigle", 42, "MB")] }),
    );

    expect(sheet.lines[0]).toMatchObject({ done: true, initials: "MB", doneAt: SORTIE_DU_FOUR });
  });

  it("rend `null` en initiales sur une ligne cochée sans signature", () => {
    // La chaîne vide n'est pas une signature : la colonne reste vide plutôt que
    // de montrer un blanc qui ressemble à une case à remplir.
    const sheet = worksheetOf(
      sources({ closedAt: TIRAGE, counts: [count("PAI-SEI", "Pain de seigle", 42, "")] }),
    );

    expect(sheet.lines[0]).toMatchObject({ done: true, initials: null });
  });
});

describe("worksheetOf — l'écart", () => {
  it("compte les commandes arrivées, les pièces en plus, et nomme les lignes", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-SEI", "Pain de seigle", 30)],
        arrivals: [
          arrival("ord_1", [["PAI-SEI", "Pain de seigle", 8]]),
          arrival("ord_2", [["PAI-SEI", "Pain de seigle", 4]]),
        ],
      }),
    );

    expect(sheet.drift).not.toBeNull();
    expect(sheet.drift?.orders).toBe(2);
    expect(sheet.drift?.addedUnits).toBe(12);
    expect(sheet.drift?.lines).toHaveLength(1);
    expect(sheet.drift?.lines[0]).toMatchObject({ sku: "PAI-SEI", from: 30, to: 42 });
  });

  it("🔴 dit qu'une ligne qui monte est DÉJÀ COCHÉE", () => {
    // Le seul cas réellement dangereux du lot : quelqu'un a déclaré avoir sorti
    // 30 pièces d'un article qui en demande 42, et personne ne s'en apercevrait
    // avant le colisage.
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-SEI", "Pain de seigle", 30, "MB")],
        arrivals: [arrival("ord_1", [["PAI-SEI", "Pain de seigle", 12]])],
      }),
    );

    expect(sheet.drift?.lines[0]).toMatchObject({ from: 30, to: 42, done: true });
  });

  it("annonce un article entièrement neuf avec `from: 0`", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-SEI", "Pain de seigle", 30)],
        arrivals: [arrival("ord_1", [["VIE-CRO", "Croissant", 24]])],
      }),
    );

    expect(sheet.drift?.lines).toHaveLength(1);
    expect(sheet.drift?.lines[0]).toMatchObject({
      sku: "VIE-CRO",
      productName: "Croissant",
      from: 0,
      to: 24,
      done: false,
    });
  });

  it("garde le nom de la FICHE quand la commande qui arrive en porte un autre", () => {
    // C'est le nom que le fournil lit depuis 4 h ; celui d'une commande qui
    // arrive ne doit pas le remplacer sous ses yeux.
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-SEI", "Pain de seigle", 30)],
        arrivals: [arrival("ord_1", [["PAI-SEI", "Seigle 500g", 12]])],
      }),
    );

    expect(sheet.drift?.lines[0]?.productName).toBe("Pain de seigle");
  });

  it("ne rend AUCUN bandeau quand rien n'est arrivé", () => {
    const sheet = worksheetOf(
      sources({ closedAt: TIRAGE, counts: [count("PAI-SEI", "Pain de seigle", 30)] }),
    );

    expect(sheet.drift).toBeNull();
  });
});

describe("worksheetOf — le contenant", () => {
  it("arrondit AU-DESSUS : 41 pièces pour 10 par tourneuse font 5 tourneuses", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-BAG", "Baguette", 41)],
        containers: new Map([["PAI-BAG", TOURNEUSE]]),
      }),
    );

    expect(sheet.lines[0]?.containerLabel).toBe("5 tourneuses");
  });

  it("met le SINGULIER à un seul contenant", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-BAG", "Baguette", 7)],
        containers: new Map([["PAI-BAG", TOURNEUSE]]),
      }),
    );

    expect(sheet.lines[0]?.containerLabel).toBe("1 tourneuse");
  });

  it("laisse la colonne VIDE quand aucun contenant n'est réglé", () => {
    // Une fiche qui inventerait « 1 plaque » ferait sortir la mauvaise quantité.
    const sheet = worksheetOf(
      sources({ closedAt: TIRAGE, counts: [count("PAI-SEI", "Pain de seigle", 30)] }),
    );

    expect(sheet.lines[0]?.containerLabel).toBeNull();
  });

  it("règle aussi les lignes d'une journée ouverte", () => {
    const sheet = worksheetOf(
      sources({
        demand: [demanded("PAI-BAG", "Baguette", 20)],
        containers: new Map([["PAI-BAG", TOURNEUSE]]),
      }),
    );

    expect(sheet.lines[0]?.containerLabel).toBe("2 tourneuses");
  });
});

describe("worksheetOf — l'ordre des lignes", () => {
  it("met le plus gros d'abord, puis départage par nom, puis par SKU", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [
          count("VIE-CRO", "Croissant", 40),
          count("PAI-BAG", "Baguette", 410),
          count("ZZZ-ALP", "Alpha", 40),
          count("AAA-ALP", "Alpha", 40),
        ],
      }),
    );

    expect(sheet.lines).toHaveLength(4);
    expect(sheet.lines.map((line) => line.sku)).toEqual([
      "PAI-BAG",
      "AAA-ALP",
      "ZZZ-ALP",
      "VIE-CRO",
    ]);
  });

  it("trie l'écart de la même façon, sur la quantité D'APRÈS", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: TIRAGE,
        counts: [count("PAI-SEI", "Pain de seigle", 30)],
        arrivals: [
          arrival("ord_1", [
            ["PAI-SEI", "Pain de seigle", 12],
            ["VIE-CRO", "Croissant", 100],
          ]),
        ],
      }),
    );

    expect(sheet.drift?.lines).toHaveLength(2);
    expect(sheet.drift?.lines.map((line) => line.sku)).toEqual(["VIE-CRO", "PAI-SEI"]);
  });
});
