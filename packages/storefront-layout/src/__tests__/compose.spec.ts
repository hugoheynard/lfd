import {
  type ComposableObject,
  type ComposedCell,
  composeShelf,
  hasComposedObject,
} from "../compose.js";
import { type RenderableContent } from "../render.js";

const product = (sku: string): RenderableContent => ({ kind: "product", sku });
const info: RenderableContent = {
  kind: "info",
  title: { fr: "Noël" },
  image: { url: "https://cdn.example/noel.jpg" },
};
// Une info sans titre ne s'affiche pas ; sans image, si (2026-09-24).
const infoWithoutTitle: RenderableContent = { ...info, title: { fr: "" } };

const carousel = { nav: "dots", autoplay: true, intervalSeconds: 5, firstSeconds: 8 } as const;

function object(overrides: Partial<ComposableObject> & Pick<ComposableObject, "id">) {
  return {
    shape: "card",
    column: 1,
    row: 1,
    applyOnMobile: true,
    carousel: null,
    contents: [info],
    ...overrides,
  } satisfies ComposableObject;
}

const shelf = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `P${index + 1}`);

const served = (skus: readonly string[]): ReadonlySet<string> => new Set(skus);

const fills = (cells: readonly ComposedCell[]): readonly string[] =>
  cells.flatMap((cell) => (cell.slot.kind === "fill" ? [cell.slot.sku] : []));

const at = (cells: readonly ComposedCell[], key: string): ComposedCell => {
  const cell = cells.find((candidate) => candidate.key === key);
  if (cell === undefined) {
    throw new Error(`case absente : ${key}`);
  }
  return cell;
};

describe("composer une page sans objet", () => {
  it("un rayon sans page s'écoule en cartes, cinq par rangée, dans l'ordre du catalogue", () => {
    const skus = shelf(7);
    const cells = composeShelf({ rows: 0, objects: [] }, skus, served(skus));

    expect(fills(cells)).toEqual(skus);
    expect(cells.map((cell) => [cell.desk.col, cell.desk.row])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [1, 2],
      [2, 2],
    ]);
    expect(cells.map((cell) => cell.mobile.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(hasComposedObject(cells)).toBe(false);
  });

  it("une page à rangées mais sans objet remplit la grille puis s'écoule dessous", () => {
    const skus = shelf(12);
    const cells = composeShelf({ rows: 2, objects: [] }, skus, served(skus));

    expect(fills(cells)).toEqual(skus);
    expect(at(cells, "sku:P11").desk).toMatchObject({ col: 1, row: 3 });
    expect(at(cells, "sku:P12").desk).toMatchObject({ col: 2, row: 3 });
  });

  it("un rayon vide ne rend aucune case", () => {
    expect(composeShelf({ rows: 3, objects: [] }, [], served([]))).toEqual([]);
  });
});

describe("poser les objets", () => {
  it("une tuile posée prend sa place au bureau et sa taille en pile", () => {
    const skus = shelf(10);
    const tile = object({ id: "noel", shape: "tile", column: 2, row: 1 });
    const cells = composeShelf({ rows: 2, objects: [tile] }, skus, served(skus));

    const placed = at(cells, "object:noel");
    expect(placed.desk).toMatchObject({ col: 2, row: 1, cols: 2, rows: 1 });
    expect(placed.mobile).toMatchObject({ cols: 2, rows: 1, order: 1 });
    expect(placed.slot).toEqual({ kind: "object", object: tile, contents: [info], carousel: null });
    expect(hasComposedObject(cells)).toBe(true);
  });

  it("les cases libres se remplissent en ordre de lecture, autour de l'objet", () => {
    const skus = shelf(10);
    const block = object({ id: "b", shape: "block", column: 2, row: 1 });
    const cells = composeShelf({ rows: 2, objects: [block] }, skus, served(skus));

    // Rangée 1 : 1, [bloc 2-3], 4, 5 ; rangée 2 : 1, [bloc], 4, 5.
    expect(cells.map((cell) => cell.key).slice(0, 7)).toEqual([
      "sku:P1",
      "object:b",
      "sku:P2",
      "sku:P3",
      "sku:P4",
      "sku:P5",
      "sku:P6",
    ]);
    expect(at(cells, "sku:P4").desk).toMatchObject({ col: 1, row: 2 });
    expect(at(cells, "sku:P5").desk).toMatchObject({ col: 4, row: 2 });
    // Le reste coule sous la page.
    expect(at(cells, "sku:P7").desk).toMatchObject({ col: 1, row: 3 });
  });

  it("l'ordre de la pile suit l'ordre de lecture, objets et cases mêlés", () => {
    const skus = shelf(6);
    const band = object({ id: "band", shape: "band", column: 1, row: 2 });
    const cells = composeShelf({ rows: 2, objects: [band] }, skus, served(skus));

    expect(cells.map((cell) => cell.key)).toEqual([
      "sku:P1",
      "sku:P2",
      "sku:P3",
      "sku:P4",
      "sku:P5",
      "object:band",
      "sku:P6",
    ]);
    expect(cells.map((cell) => cell.mobile.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(at(cells, "object:band").mobile).toMatchObject({ cols: 2, rows: 1 });
  });

  it("« appliquer en mobile » à non réduit l'objet à une carte dans la pile, pas au bureau", () => {
    const skus = shelf(4);
    const hero = object({ id: "h", shape: "hero", applyOnMobile: false });
    const cells = composeShelf({ rows: 2, objects: [hero] }, skus, served(skus));

    expect(at(cells, "object:h").desk).toMatchObject({ cols: 3, rows: 2 });
    expect(at(cells, "object:h").mobile).toMatchObject({ cols: 1, rows: 1 });
  });

  it("le hero passe à 2×2 en pile, la bande double aussi", () => {
    const skus = shelf(0);
    const hero = object({ id: "h", shape: "hero" });
    const double = object({ id: "d", shape: "doubleBand", row: 3 });
    const cells = composeShelf({ rows: 4, objects: [hero, double] }, skus, served(skus));

    expect(at(cells, "object:h").mobile).toMatchObject({ cols: 2, rows: 2 });
    expect(at(cells, "object:d").mobile).toMatchObject({ cols: 2, rows: 2 });
  });
});

describe("aucune case n'est jamais vide", () => {
  it("un objet sans contenu rend ses cases au rayon", () => {
    const skus = shelf(5);
    const empty = object({ id: "vide", shape: "tile", contents: [] });
    const cells = composeShelf({ rows: 1, objects: [empty] }, skus, served(skus));

    expect(cells.some((cell) => cell.key === "object:vide")).toBe(false);
    expect(fills(cells)).toEqual(skus);
    expect(at(cells, "sku:P1").desk).toMatchObject({ col: 1, row: 1 });
  });

  it("un article qui n'est plus servi ne se pose pas : sa case retombe au rayon", () => {
    const skus = shelf(5);
    const gone = object({ id: "g", contents: [product("RETIRE")] });
    const cells = composeShelf({ rows: 1, objects: [gone] }, skus, served(skus));

    expect(hasComposedObject(cells)).toBe(false);
    expect(fills(cells)).toEqual(skus);
  });

  it("une info sans titre ne se pose pas", () => {
    const skus = shelf(2);
    const bare = object({ id: "i", contents: [infoWithoutTitle] });
    const cells = composeShelf({ rows: 1, objects: [bare] }, skus, served(skus));

    expect(hasComposedObject(cells)).toBe(false);
  });

  it("un objet à plusieurs contenus perd ceux qui ne s'affichent plus, et garde les autres", () => {
    const skus = shelf(3);
    const mixed = object({
      id: "m",
      shape: "tile",
      carousel,
      contents: [product("RETIRE"), info, product("P2"), infoWithoutTitle],
    });
    const cells = composeShelf({ rows: 1, objects: [mixed] }, skus, served(skus));

    expect(at(cells, "object:m").slot).toMatchObject({
      kind: "object",
      contents: [info, product("P2")],
      carousel,
    });
  });

  it("un défilement réduit à un seul contenu n'est plus un défilement", () => {
    const skus = shelf(3);
    const mixed = object({ id: "m", carousel, contents: [product("RETIRE"), info] });
    const cells = composeShelf({ rows: 1, objects: [mixed] }, skus, served(skus));

    expect(at(cells, "object:m").slot).toMatchObject({ contents: [info], carousel: null });
  });

  it("un objet réglé sur UN contenu n'en montre que le premier, même s'il en garde d'autres", () => {
    const skus = shelf(3);
    const single = object({ id: "s", carousel: null, contents: [info, product("P1")] });
    const cells = composeShelf({ rows: 1, objects: [single] }, skus, served(skus));

    expect(at(cells, "object:s").slot).toMatchObject({ contents: [info], carousel: null });
    // Le contenu gardé mais inactif ne réserve pas son article : personne ne
    // le verrait, et le rayon le perdrait.
    expect(fills(cells)).toContain("P1");
  });
});

describe("sans doublon", () => {
  it("un article posé par un objet ne reparaît pas dans les cases libres", () => {
    const skus = shelf(6);
    const star = object({ id: "star", shape: "tile", column: 4, contents: [product("P2")] });
    const cells = composeShelf({ rows: 1, objects: [star] }, skus, served(skus));

    expect(fills(cells)).toEqual(["P1", "P3", "P4", "P5", "P6"]);
    expect(cells.filter((cell) => cell.key === "sku:P2")).toEqual([]);
  });

  it("tous les articles d'un défilement sont réservés", () => {
    const skus = shelf(4);
    const run = object({ id: "r", carousel, contents: [product("P1"), product("P3")] });
    const cells = composeShelf({ rows: 1, objects: [run] }, skus, served(skus));

    expect(fills(cells)).toEqual(["P2", "P4"]);
  });

  it("un article d'un AUTRE rayon peut être mis en avant : il se rend, sans rien retirer au rayon", () => {
    const skus = shelf(3);
    const guest = object({ id: "g", contents: [product("AILLEURS")] });
    const cells = composeShelf({ rows: 1, objects: [guest] }, skus, served([...skus, "AILLEURS"]));

    expect(hasComposedObject(cells)).toBe(true);
    expect(fills(cells)).toEqual(skus);
  });

  it("un SKU répété dans le rayon ne se rend qu'une fois", () => {
    const cells = composeShelf({ rows: 1, objects: [] }, ["A", "B", "A"], served(["A", "B"]));
    expect(fills(cells)).toEqual(["A", "B"]);
  });
});

describe("une page servie qui contredirait la règle", () => {
  it("un objet qui chevauche un objet déjà posé (ordre de lecture) ne se pose pas", () => {
    const skus = shelf(10);
    const first = object({ id: "a", shape: "block", column: 1, row: 1 });
    const second = object({ id: "b", shape: "tile", column: 2, row: 2 });
    const cells = composeShelf({ rows: 2, objects: [second, first] }, skus, served(skus));

    expect(cells.some((cell) => cell.key === "object:a")).toBe(true);
    expect(cells.some((cell) => cell.key === "object:b")).toBe(false);
  });

  it("un objet qui déborde des rangées ou des colonnes ne se pose pas", () => {
    const skus = shelf(5);
    const low = object({ id: "low", shape: "block", row: 1 });
    const wide = object({ id: "wide", shape: "tile", column: 5 });
    const cells = composeShelf({ rows: 1, objects: [low, wide] }, skus, served(skus));

    expect(hasComposedObject(cells)).toBe(false);
  });

  it("un objet non affichable ne bloque pas celui qu'il aurait chevauché", () => {
    const skus = shelf(5);
    const empty = object({ id: "e", shape: "block", contents: [] });
    const card = object({ id: "c", column: 2, row: 2 });
    const cells = composeShelf({ rows: 2, objects: [empty, card] }, skus, served(skus));

    expect(at(cells, "object:c").desk).toMatchObject({ col: 2, row: 2 });
  });
});

describe("la hauteur plancher des cases seules", () => {
  it("une bande seule sur sa rangée est seule ; une carte parmi d'autres ne l'est pas", () => {
    const skus = shelf(10);
    const band = object({ id: "band", shape: "doubleBand", row: 2 });
    const cells = composeShelf({ rows: 3, objects: [band] }, skus, served(skus));

    expect(at(cells, "object:band").desk.alone).toBe(true);
    expect(at(cells, "sku:P1").desk.alone).toBe(false);
  });

  it("un bloc entouré d'articles n'est pas seul", () => {
    const skus = shelf(10);
    const block = object({ id: "b", shape: "block" });
    const cells = composeShelf({ rows: 2, objects: [block] }, skus, served(skus));

    expect(at(cells, "object:b").desk.alone).toBe(false);
  });

  it("un bloc que le rayon, épuisé, laisse sans voisin est seul", () => {
    const block = object({ id: "b", shape: "block" });
    const cells = composeShelf({ rows: 2, objects: [block] }, [], served([]));

    expect(cells).toHaveLength(1);
    expect(at(cells, "object:b").desk.alone).toBe(true);
  });
});
