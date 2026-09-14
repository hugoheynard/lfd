import type {
  PackedLineMark,
  ProducedItemSnapshot,
  ProductionOrderSnapshot,
} from "../../entities/production-day.js";
import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import {
  canDeclareReady,
  packingBoardOf,
  relativeDayOf,
  type PackingSources,
} from "../production-packing.js";

/**
 * **La balance**, éprouvée en fonction pure : on pose un état de journée, on
 * lit les deux plateaux. Ni Nest, ni base, ni double.
 *
 * Les dates ne sont jamais comparées à l'horloge ici — elles sont recopiées
 * telles quelles dans la vue, et c'est la seule chose qu'on en vérifie.
 */

/**
 * Le jour lu est **dérivé de maintenant**, jamais écrit en dur : `relativeDay`
 * le compare à l'horloge, et une date figée passerait un jour pour « demain ».
 * À sept jours, il n'est ni aujourd'hui ni demain, quel que soit le jour où la
 * suite tourne.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;
const DATE = addDays(TODAY, 7);
const CLOSED_AT = new Date("2026-09-07T18:00:00.000Z");
const PACKED: PackedLineMark = {
  at: new Date("2026-09-08T05:30:00.000Z"),
  by: "auth0|karim",
  initials: "MB",
};

function line(
  sku: string,
  productName: string,
  quantity: number,
  packed: PackedLineMark | null = null,
): ProductionOrderSnapshot["lines"][number] {
  return { sku, productName, quantity, packed };
}

function sheet(
  reference: string,
  lines: ProductionOrderSnapshot["lines"],
  packed: ProductionOrderSnapshot["packed"] = null,
  containers = 0,
): ProductionOrderSnapshot {
  return {
    packed,
    containers,
    orderId: `ord_${reference}`,
    reference,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    lines,
  };
}

/**
 * Une ligne du compte à produire. **Sortie du four par défaut** : la plupart des
 * cas de ce fichier parlent de la balance, pas de l'attente, et un article non
 * fabriqué partout brouillerait ce qu'ils éprouvent.
 *
 * L'instant de la coche n'est jamais comparé à l'horloge — seule sa présence
 * compte ici.
 */
function count(
  sku: string,
  productName: string,
  quantity: number,
  done = true,
): ProducedItemSnapshot {
  return {
    sku,
    productName,
    quantity,
    done: done ? { at: CLOSED_AT, by: "auth0|karim", initials: "KA" } : null,
  };
}

function sources(overrides: Partial<PackingSources> = {}): PackingSources {
  return { date: DATE, closedAt: CLOSED_AT, orders: [], counts: [], now: NOW, ...overrides };
}

describe("une journée qui n'est pas arrêtée", () => {
  it("rend le vide plutôt que de lever — il n'y a rien à coliser, pas une erreur", () => {
    const board = packingBoardOf(sources({ closedAt: null }));

    expect(board).toEqual({
      date: DATE,
      closedAt: null,
      sheets: [],
      resources: [],
      orderCount: 0,
      todoCount: 0,
      readyCount: 0,
      relativeDay: null,
    });
  });
});

describe("les bacs", () => {
  it("rend chaque bon avec l'état de ses lignes", () => {
    const board = packingBoardOf(
      sources({
        orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)])],
        counts: [count("VIE-001", "Croissant", 12)],
      }),
    );

    expect(board.closedAt).toBe(CLOSED_AT.toISOString());
    expect(board.sheets).toHaveLength(1);
    expect(board.sheets[0]?.lines).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        quantity: 12,
        packed: true,
        initials: "MB",
        packedAt: PACKED.at.toISOString(),
        awaitingProduction: false,
      },
    ]);
  });

  it("ne rend AUCUNE initiale quand la ligne a été cochée sans signer", () => {
    // La chaîne vide n'est pas une signature : l'écran n'a alors rien à
    // afficher, plutôt qu'un blanc qui appelle un crayon.
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [line("VIE-001", "Croissant", 12, { ...PACKED, initials: "" })]),
        ],
      }),
    );

    expect(board.sheets[0]?.lines[0]).toMatchObject({ packed: true, initials: null });
  });

  it("remonte le nombre de containers de la commande", () => {
    // Les bacs du VÉHICULE, pas le matériel du four : `production_container`
    // est réglé par SKU et ne dit rien d'une commande.
    const board = packingBoardOf(
      sources({ orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12)], null, 3)] }),
    );

    expect(board.sheets[0]?.containers).toBe(3);
  });

  it("range les bacs par RÉFÉRENCE — c'est le numéro lu sur le bon", () => {
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0009", [line("VIE-001", "Croissant", 1)]),
          sheet("CMD-0002", [line("VIE-001", "Croissant", 1)]),
        ],
      }),
    );

    expect(board.sheets.map((entry) => entry.reference)).toEqual(["CMD-0002", "CMD-0009"]);
  });

  it("porte la fermeture du bac, qui n'est PAS l'état de ses lignes", () => {
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [line("VIE-001", "Croissant", 12)], {
            at: PACKED.at,
            by: "auth0|karim",
          }),
        ],
      }),
    );

    expect(board.sheets[0]).toMatchObject({
      packedAt: PACKED.at.toISOString(),
      packedBy: "auth0|karim",
    });
    expect(board.sheets[0]?.lines[0]?.packed).toBe(false);
  });
});

describe("la ressource", () => {
  it("somme les lignes COCHÉES, tous bacs confondus", () => {
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)]),
          sheet("CMD-0002", [
            line("VIE-001", "Croissant", 8, PACKED),
            // Pas cochée : elle est due, elle n'est pas encore prise.
            line("PAI-001", "Baguette tradition", 30),
          ]),
        ],
        counts: [count("VIE-001", "Croissant", 40), count("PAI-001", "Baguette tradition", 30)],
      }),
    );

    expect(board.resources).toEqual([
      {
        sku: "PAI-001",
        productName: "Baguette tradition",
        produced: 30,
        allocated: 0,
        remaining: 30,
        awaitingProduction: false,
        exhausted: false,
      },
      {
        sku: "VIE-001",
        productName: "Croissant",
        produced: 40,
        allocated: 20,
        remaining: 20,
        awaitingProduction: false,
        exhausted: false,
      },
    ]);
  });

  it("🔴 rend un `remaining` NÉGATIF quand les bacs veulent plus que le four n'a sorti", () => {
    // Ce n'est pas une erreur de calcul, et le masquer à zéro l'effacerait :
    // c'est exactement ce qu'un fournil doit voir tôt, pas à 7 h au comptoir.
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [line("VIE-001", "Croissant", 30, PACKED)]),
          sheet("CMD-0002", [line("VIE-001", "Croissant", 25, PACKED)]),
        ],
        counts: [count("VIE-001", "Croissant", 40)],
      }),
    );

    expect(board.resources[0]).toMatchObject({ produced: 40, allocated: 55, remaining: -15 });
  });

  it("garde un article des bacs que le compte a perdu, avec `produced: 0`", () => {
    // Il disparaîtrait de la balance alors que ses pièces sont bel et bien
    // prises quelque part ; le `remaining` négatif crie ce qu'il faut entendre.
    const board = packingBoardOf(
      sources({
        orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)])],
        counts: [],
      }),
    );

    expect(board.resources).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        produced: 0,
        allocated: 12,
        remaining: -12,
        // Absent du compte à produire : arrivé après le tirage, jamais fabriqué.
        awaitingProduction: true,
        exhausted: false,
      },
    ]);
  });

  it("🔴 signale l'article que le four n'a pas encore sorti", () => {
    const board = packingBoardOf(
      sources({
        orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12)])],
        counts: [count("VIE-001", "Croissant", 12, false)],
      }),
    );

    expect(board.resources[0]?.awaitingProduction).toBe(true);
    expect(board.sheets[0]?.lines[0]?.awaitingProduction).toBe(true);
  });

  it("ne signale plus rien une fois la ligne cochée sur la fiche d'atelier", () => {
    const board = packingBoardOf(
      sources({
        orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12)])],
        counts: [count("VIE-001", "Croissant", 12)],
      }),
    );

    expect(board.resources[0]?.awaitingProduction).toBe(false);
    expect(board.sheets[0]?.lines[0]?.awaitingProduction).toBe(false);
  });

  it("🔴 tient pour EN ATTENTE un SKU absent du compte à produire", () => {
    // Il est arrivé après le tirage : personne ne l'a fabriqué, ni même pu le
    // cocher. Le traiter comme disponible ferait de l'absence d'information une
    // autorisation.
    const board = packingBoardOf(
      sources({
        orders: [sheet("CMD-0001", [line("PAI-001", "Baguette tradition", 30)])],
        counts: [count("VIE-001", "Croissant", 12)],
      }),
    );

    expect(board.sheets[0]?.lines[0]?.awaitingProduction).toBe(true);
    expect(board.resources.find((entry) => entry.sku === "PAI-001")?.awaitingProduction).toBe(true);
  });

  it("dit épuisé l'article sorti du four dont tout le tirage est au bac", () => {
    const board = packingBoardOf(
      sources({
        orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)])],
        counts: [count("VIE-001", "Croissant", 12)],
      }),
    );

    expect(board.resources[0]).toMatchObject({ remaining: 0, exhausted: true });
  });

  it("🔴 ne dit JAMAIS épuisé un article en manque, ni un article qui attend le four", () => {
    // Masquer l'un ou l'autre sous « stock épuisé » effacerait précisément ce
    // que la colonne doit montrer : il en manque, ou il n'est pas encore fait.
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [
            line("VIE-001", "Croissant", 15, PACKED),
            line("PAI-001", "Baguette tradition", 30),
          ]),
        ],
        counts: [
          count("VIE-001", "Croissant", 12),
          count("PAI-001", "Baguette tradition", 0, false),
        ],
      }),
    );

    expect(board.resources.find((entry) => entry.sku === "VIE-001")).toMatchObject({
      remaining: -3,
      exhausted: false,
    });
    expect(board.resources.find((entry) => entry.sku === "PAI-001")).toMatchObject({
      remaining: 0,
      awaitingProduction: true,
      exhausted: false,
    });
  });

  it("range les ressources par NOM de produit, puis par SKU", () => {
    const board = packingBoardOf(
      sources({
        counts: [
          count("VIE-002", "Pain au chocolat", 5),
          count("PAI-001", "Baguette tradition", 5),
          count("PAI-000", "Baguette tradition", 5),
        ],
      }),
    );

    expect(board.resources.map((entry) => entry.sku)).toEqual(["PAI-000", "PAI-001", "VIE-002"]);
  });
});

describe("les compteurs d'un bac — l'écran n'additionne rien", () => {
  it("compte les lignes et les PIÈCES d'une commande à moitié cochée", () => {
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [
            line("VIE-001", "Croissant", 12, PACKED),
            line("PAI-001", "Baguette tradition", 30),
            line("VIE-002", "Pain au chocolat", 8, PACKED),
          ]),
        ],
      }),
    );

    expect(board.sheets).toHaveLength(1);
    expect(board.sheets[0]).toMatchObject({
      lineCount: 3,
      packedLines: 2,
      remainingLines: 1,
      pieces: 50,
      packedPieces: 20,
      canDeclareReady: false,
    });
  });

  it("permet de déclarer prête une commande dont toutes les lignes sont au bac", () => {
    const board = packingBoardOf(
      sources({ orders: [sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)])] }),
    );

    expect(board.sheets[0]).toMatchObject({ remainingLines: 0, canDeclareReady: true });
  });

  it("ne permet plus de déclarer prête une commande DÉJÀ déclarée", () => {
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)], {
            at: PACKED.at,
            by: "auth0|karim",
          }),
        ],
      }),
    );

    expect(board.sheets[0]?.canDeclareReady).toBe(false);
  });

  it("ne permet pas de déclarer prête une commande SANS ligne", () => {
    // « Toutes ses lignes sont au bac » est vrai sur une liste vide ; annoncer
    // prêt un colis vide serait le mensonge qu'on veut rendre impossible.
    expect(canDeclareReady(sheet("CMD-0001", []))).toBe(false);
  });
});

describe("les compteurs de la journée", () => {
  it("sépare les commandes à préparer de celles déclarées prêtes", () => {
    const sealed = { at: PACKED.at, by: "auth0|karim" };
    const board = packingBoardOf(
      sources({
        orders: [
          sheet("CMD-0001", [line("VIE-001", "Croissant", 12, PACKED)], sealed),
          sheet("CMD-0002", [line("VIE-001", "Croissant", 12)]),
          sheet("CMD-0003", [line("VIE-001", "Croissant", 12)]),
        ],
      }),
    );

    expect(board).toMatchObject({ orderCount: 3, todoCount: 2, readyCount: 1 });
  });
});

describe("la journée relative — selon l'horloge du serveur", () => {
  it("dit « today », « tomorrow », ou rien", () => {
    expect(relativeDayOf(TODAY, NOW)).toBe("today");
    expect(relativeDayOf(addDays(TODAY, 1), NOW)).toBe("tomorrow");
    expect(relativeDayOf(addDays(TODAY, 2), NOW)).toBeNull();
    expect(relativeDayOf(addDays(TODAY, -1), NOW)).toBeNull();
  });

  it("🔴 lit le jour à l'heure de PARIS, pas en UTC", () => {
    // À 00 h 30 à Paris, il est encore la VEILLE en UTC (22 h 30 l'été, 23 h 30
    // l'hiver). Un `toISOString().slice(0, 10)` dirait « demain » d'une journée
    // que le fournil a déjà commencée.
    const justAfterMidnight = localToInstant(TODAY, "00:30");
    if (justAfterMidnight === null) {
      throw new Error("00:30 existe tous les jours à Paris — le changement d'heure est à 02:00.");
    }

    expect(relativeDayOf(TODAY, justAfterMidnight)).toBe("today");
  });

  it("est calculée même sur une journée qui n'est pas arrêtée", () => {
    expect(packingBoardOf(sources({ date: TODAY, closedAt: null })).relativeDay).toBe("today");
  });
});
