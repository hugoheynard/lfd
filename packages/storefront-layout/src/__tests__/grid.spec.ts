import {
  checkPlacement,
  checkRowLimit,
  describeFormat,
  firstFreeCell,
  FORMATS,
  formatSpec,
  freeCells,
  GRID_COLUMNS,
  moveBy,
  onShelf,
  overlaps,
  place,
  type PlacedBlock,
  readingOrder,
  refusalMessage,
  removeBlock,
  setShelves,
} from "../grid.js";

const ALL = ["all"] as const;

const tile: PlacedBlock = { id: "t", format: "tile", column: 1, row: 1, shelves: ALL };
const card: PlacedBlock = { id: "c", format: "card", column: 3, row: 1, shelves: ALL };
const tileRight: PlacedBlock = { id: "b", format: "tile", column: 4, row: 1, shelves: ALL };
const kakemono: PlacedBlock = { id: "v", format: "kakemono", column: 2, row: 2, shelves: ALL };
const hero: PlacedBlock = { id: "h", format: "hero", column: 3, row: 5, shelves: ALL };
const band2: PlacedBlock = { id: "d", format: "doubleBand", column: 1, row: 3, shelves: ALL };
const EXAMPLE = [tile, card, tileRight, band2];

describe("la table des formats", () => {
  it("porte les six formes du document, dans l’ordre de la palette (colonnes × rangées)", () => {
    expect(FORMATS.map((f) => describeFormat(f.format))).toEqual([
      "Carte 1×1",
      "Kakémono 1×2",
      "Tuile 2×1",
      "Bloc 2×2",
      "Hero 3×2",
      "Bande simple 5×1",
      "Bande double 5×2",
    ]);
  });

  it("une forme ne porte aucun type de contenu", () => {
    for (const spec of FORMATS) {
      expect(Object.keys(spec).sort()).toEqual([
        "columns",
        "format",
        "label",
        "mobileColumns",
        "mobileRows",
        "rows",
      ]);
    }
  });

  it("les bandes couvrent toute la largeur", () => {
    expect(formatSpec("band").columns).toBe(GRID_COLUMNS);
    expect(formatSpec("doubleBand").columns).toBe(GRID_COLUMNS);
  });
});

describe("overlaps", () => {
  it("voit un recouvrement partiel sur deux rangées", () => {
    expect(overlaps({ id: "x", format: "block", column: 2, row: 2, shelves: ALL }, band2)).toBe(
      true,
    );
  });

  it("deux objets bord à bord ne se chevauchent pas", () => {
    expect(overlaps(tile, card)).toBe(false);
    expect(overlaps(card, tileRight)).toBe(false);
  });

  it("est symétrique", () => {
    const block: PlacedBlock = { id: "x", format: "block", column: 1, row: 2, shelves: ALL };
    expect(overlaps(block, band2)).toBe(overlaps(band2, block));
  });
});

describe("checkPlacement", () => {
  it("le hero 3×2 : tient en colonne 3, déborde en colonne 4, heurte ce qui est dessous", () => {
    expect(checkPlacement([], 6, hero)).toEqual({ ok: true });
    expect(checkPlacement([], 6, { ...hero, column: 4 })).toMatchObject({
      ok: false,
      reason: "columns",
    });
    expect(checkPlacement([], 6, { ...hero, row: 6 })).toMatchObject({ ok: false, reason: "rows" });
    expect(checkPlacement([band2], 6, { ...hero, row: 4 })).toMatchObject({
      ok: false,
      reason: "overlap",
      blocker: band2,
    });
    expect(checkPlacement([{ ...card, id: "x", column: 5, row: 6 }], 6, hero)).toMatchObject({
      ok: false,
      reason: "overlap",
    });
  });

  it("le kakémono occupe deux rangées : collision en dessous, débordement en bas", () => {
    expect(checkPlacement([kakemono], 6, { ...card, id: "x", column: 2, row: 3 })).toMatchObject({
      ok: false,
      reason: "overlap",
      blocker: kakemono,
    });
    expect(checkPlacement([tile], 6, kakemono)).toEqual({ ok: true });
    expect(checkPlacement([], 6, { ...kakemono, row: 6 })).toMatchObject({
      ok: false,
      reason: "rows",
    });
    expect(checkPlacement([band2], 6, kakemono)).toMatchObject({
      ok: false,
      reason: "overlap",
      blocker: band2,
    });
  });

  it("accepte l'exemple d'aujourd'hui sur 6 rangées", () => {
    for (const block of EXAMPLE) {
      expect(checkPlacement(EXAMPLE, 6, block)).toEqual({ ok: true });
    }
  });

  it("refuse le débordement des 5 colonnes", () => {
    expect(
      checkPlacement([], 6, { id: "x", format: "tile", column: 5, row: 1, shelves: ALL }),
    ).toEqual({
      ok: false,
      reason: "columns",
    });
    expect(
      checkPlacement([], 6, { id: "x", format: "band", column: 2, row: 1, shelves: ALL }).ok,
    ).toBe(false);
  });

  it("refuse le débordement des R rangées, à la dernière rangée près", () => {
    expect(
      checkPlacement([], 6, { id: "x", format: "block", column: 1, row: 6, shelves: ALL }),
    ).toEqual({
      ok: false,
      reason: "rows",
    });
    expect(
      checkPlacement([], 6, { id: "x", format: "block", column: 1, row: 5, shelves: ALL }).ok,
    ).toBe(true);
  });

  it("refuse une position avant la première case", () => {
    expect(
      checkPlacement([], 6, { id: "x", format: "card", column: 0, row: 1, shelves: ALL }),
    ).toEqual({
      ok: false,
      reason: "outside",
    });
    expect(
      checkPlacement([], 6, { id: "x", format: "card", column: 1, row: 0, shelves: ALL }).ok,
    ).toBe(false);
  });

  it("refuse le chevauchement en nommant l’objet qui gêne", () => {
    expect(
      checkPlacement(EXAMPLE, 6, { id: "x", format: "card", column: 2, row: 1, shelves: ALL }),
    ).toEqual({
      ok: false,
      reason: "overlap",
      blocker: tile,
      shelf: "all",
    });
  });

  it("ignore l’objet lui-même (on le déplace)", () => {
    expect(checkPlacement(EXAMPLE, 6, { ...tile, row: 2 }).ok).toBe(true);
  });
});

describe("place", () => {
  it("ajoute un objet neuf à la fin", () => {
    const result = place(EXAMPLE, 6, { id: "n", format: "card", column: 1, row: 2, shelves: ALL });
    expect(result.ok && result.blocks.map((b) => b.id)).toEqual(["t", "c", "b", "d", "n"]);
  });

  it("repose un objet existant à sa place dans la liste", () => {
    const result = place(EXAMPLE, 6, { ...card, row: 2 });
    expect(result.ok && result.blocks).toEqual([tile, { ...card, row: 2 }, tileRight, band2]);
  });

  it("ne modifie pas la liste reçue", () => {
    const blocks = [...EXAMPLE];
    place(blocks, 6, { id: "n", format: "card", column: 1, row: 2, shelves: ALL });
    expect(blocks).toEqual(EXAMPLE);
  });

  it("rend le refus tel quel", () => {
    expect(
      place(EXAMPLE, 6, { id: "n", format: "block", column: 1, row: 2, shelves: ALL }),
    ).toEqual({
      ok: false,
      reason: "overlap",
      blocker: band2,
      shelf: "all",
    });
  });
});

describe("moveBy", () => {
  it("décale d’une case", () => {
    const result = moveBy([card], 6, "c", -1, 1);
    expect(result.ok && result.blocks).toEqual([{ ...card, column: 2, row: 2 }]);
  });

  it("refuse de sortir par la gauche, par le haut, par la droite", () => {
    expect(moveBy([tile], 6, "t", -1, 0)).toMatchObject({ ok: false, reason: "outside" });
    expect(moveBy([tile], 6, "t", 0, -1)).toMatchObject({ ok: false, reason: "outside" });
    expect(moveBy([tileRight], 6, "b", 1, 0)).toMatchObject({ ok: false, reason: "columns" });
  });

  it("refuse de sortir par le bas", () => {
    expect(moveBy([band2], 4, "d", 0, 1)).toMatchObject({ ok: false, reason: "rows" });
  });

  it("refuse de glisser sur un voisin", () => {
    expect(moveBy(EXAMPLE, 6, "c", 1, 0)).toMatchObject({
      ok: false,
      reason: "overlap",
      blocker: tileRight,
    });
  });

  it("un id inconnu ne change rien", () => {
    expect(moveBy(EXAMPLE, 6, "nope", 1, 0)).toEqual({ ok: true, blocks: EXAMPLE });
  });
});

describe("removeBlock", () => {
  it("retire le seul objet visé", () => {
    expect(removeBlock(EXAMPLE, "c")).toEqual([tile, tileRight, band2]);
  });

  it("un id inconnu ne retire rien", () => {
    expect(removeBlock(EXAMPLE, "nope")).toEqual(EXAMPLE);
  });
});

describe("checkRowLimit", () => {
  it("accepte de réduire jusqu’au dernier objet", () => {
    expect(checkRowLimit(EXAMPLE, 4)).toEqual({ ok: true });
  });

  it("refuse sous un objet, en le nommant", () => {
    expect(checkRowLimit(EXAMPLE, 3)).toEqual({ ok: false, blocker: band2 });
  });

  it("nomme le premier gêneur en ordre de lecture", () => {
    const late: PlacedBlock = { id: "l", format: "card", column: 5, row: 5, shelves: ALL };
    const early: PlacedBlock = { id: "e", format: "card", column: 1, row: 5, shelves: ALL };
    expect(checkRowLimit([late, early], 4)).toEqual({ ok: false, blocker: early });
  });

  it("une page vide se réduit toujours", () => {
    expect(checkRowLimit([], 1)).toEqual({ ok: true });
  });
});

describe("readingOrder", () => {
  it("trie par rangée, puis colonne, sans toucher l’original", () => {
    const shuffled = [band2, tileRight, tile, card];
    expect(readingOrder(shuffled)).toEqual([tile, card, tileRight, band2]);
    expect(shuffled[0]).toBe(band2);
  });
});

describe("freeCells", () => {
  it("rend les cases libres en ordre de lecture, rangée puis colonne", () => {
    expect(freeCells(EXAMPLE, 4)).toEqual([
      { column: 1, row: 2 },
      { column: 2, row: 2 },
      { column: 3, row: 2 },
      { column: 4, row: 2 },
      { column: 5, row: 2 },
    ]);
  });

  it("une page vide est entièrement libre", () => {
    expect(freeCells([], 2)).toHaveLength(2 * GRID_COLUMNS);
  });

  it("un bloc 2×2 retire ses quatre cases, pas plus", () => {
    const block: PlacedBlock = { id: "x", format: "block", column: 2, row: 1, shelves: ALL };
    const free = freeCells([block], 2);
    expect(free).toHaveLength(2 * GRID_COLUMNS - 4);
    expect(free).not.toContainEqual({ column: 3, row: 2 });
    expect(free).toContainEqual({ column: 4, row: 2 });
  });

  it("une page pleine n’a aucune case libre", () => {
    expect(
      freeCells([{ id: "x", format: "doubleBand", column: 1, row: 1, shelves: ALL }], 2),
    ).toEqual([]);
  });
});

describe("firstFreeCell", () => {
  it("trouve la première place où le format tient", () => {
    expect(firstFreeCell(EXAMPLE, 6, "card", ALL)).toEqual({ column: 1, row: 2 });
    expect(firstFreeCell(EXAMPLE, 6, "block", ALL)).toEqual({ column: 1, row: 5 });
  });

  it("rend null quand la page est pleine pour ce format", () => {
    expect(firstFreeCell(EXAMPLE, 4, "block", ALL)).toBeNull();
    expect(firstFreeCell([], 1, "block", ALL)).toBeNull();
  });
});

describe("refusalMessage", () => {
  const label = (key: string) => key.toUpperCase();

  it("dit chaque refus en clair", () => {
    expect(refusalMessage({ reason: "columns" }, 6, label)).toBe("Déborde des 5 colonnes.");
    expect(refusalMessage({ reason: "rows" }, 6, label)).toBe("Déborde des 6 rangées de la page.");
    expect(refusalMessage({ reason: "outside" }, 6, label)).toBe("Hors de la grille.");
    expect(refusalMessage({ reason: "noShelf" }, 6, label)).toBe(
      "Un objet paraît sur au moins un rayon.",
    );
    expect(refusalMessage({ reason: "overlap", blocker: tile, shelf: "all" }, 6, label)).toBe(
      "Sur le rayon « ALL », chevauche « Tuile 2×1 » posé en colonne 1, rangée 1.",
    );
  });
});

describe("les rayons", () => {
  const easter: PlacedBlock = {
    id: "e",
    format: "doubleBand",
    column: 1,
    row: 3,
    shelves: ["all", "chocolate"],
  };
  const chocoCard: PlacedBlock = {
    id: "k",
    format: "card",
    column: 5,
    row: 1,
    shelves: ["chocolate"],
  };
  const breadBlock: PlacedBlock = {
    id: "p",
    format: "block",
    column: 1,
    row: 1,
    shelves: ["bread"],
  };

  it("onShelf ne rend que les objets du rayon, partagés compris", () => {
    const blocks = [tile, easter, chocoCard, breadBlock];
    expect(onShelf(blocks, "chocolate")).toEqual([easter, chocoCard]);
    expect(onShelf(blocks, "all")).toEqual([tile, easter]);
    expect(onShelf(blocks, "pastry")).toEqual([]);
  });

  it("deux objets de rayons différents peuvent occuper la même case", () => {
    const other: PlacedBlock = { ...tile, id: "o", shelves: ["bread"] };
    expect(checkPlacement([tile], 6, other)).toEqual({ ok: true });
  });

  it("un objet partagé se vérifie sur CHACUN de ses rayons, et le refus nomme le rayon", () => {
    const moving: PlacedBlock = { ...easter, row: 1 };
    // Libre sur « Tout », prise sur « Chocolat & confiserie » : refusé partout.
    expect(checkPlacement([chocoCard, easter], 6, moving)).toEqual({
      ok: false,
      reason: "overlap",
      blocker: chocoCard,
      shelf: "chocolate",
    });
  });

  it("refuse un objet sans rayon", () => {
    expect(checkPlacement([], 6, { ...card, shelves: [] })).toEqual({
      ok: false,
      reason: "noShelf",
    });
  });

  it("moveBy déplace un objet partagé partout à la fois", () => {
    const result = moveBy([easter], 6, "e", 0, 1);
    expect(result.ok && result.blocks).toEqual([{ ...easter, row: 4 }]);
  });

  it("setShelves étend à un rayon libre", () => {
    const result = setShelves([easter, breadBlock], 6, "e", ["all", "chocolate", "bread"]);
    expect(result.ok && result.blocks[0]?.shelves).toEqual(["all", "chocolate", "bread"]);
  });

  it("setShelves refuse d’étendre là où la place est prise, en nommant rayon et objet", () => {
    const inTheWay: PlacedBlock = {
      id: "w",
      format: "card",
      column: 2,
      row: 4,
      shelves: ["pastry"],
    };
    expect(setShelves([easter, inTheWay], 6, "e", ["all", "pastry"])).toEqual({
      ok: false,
      reason: "overlap",
      blocker: inTheWay,
      shelf: "pastry",
    });
  });

  it("setShelves refuse la liste vide et ignore les doublons", () => {
    expect(setShelves([easter], 6, "e", [])).toMatchObject({ ok: false, reason: "noShelf" });
    const result = setShelves([easter], 6, "e", ["all", "all"]);
    expect(result.ok && result.blocks[0]?.shelves).toEqual(["all"]);
  });

  it("setShelves sur un id inconnu ne change rien", () => {
    expect(setShelves([easter], 6, "nope", ["bread"])).toEqual({ ok: true, blocks: [easter] });
  });

  it("checkRowLimit regarde tous les rayons", () => {
    const low: PlacedBlock = { id: "l", format: "card", column: 1, row: 5, shelves: ["bread"] };
    expect(checkRowLimit([low], 4)).toEqual({ ok: false, blocker: low });
  });

  it("firstFreeCell cherche sur les rayons demandés seulement", () => {
    expect(firstFreeCell([breadBlock], 2, "block", ["all"])).toEqual({ column: 1, row: 1 });
    expect(firstFreeCell([breadBlock], 2, "block", ["bread"])).toEqual({ column: 3, row: 1 });
  });
});
