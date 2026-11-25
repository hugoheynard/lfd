import {
  WorkstationArchivedError,
  WorkstationNotFoundError,
  WorkstationOrderMismatchError,
} from "../../errors/workstation-errors.js";
import { ProductSku } from "../../value-objects/product-sku.js";
import { WorkstationMap } from "../workstation-map.js";

const AT = new Date(Date.UTC(2026, 0, 1));
const QUICHE = ProductSku.of("QUI-001");
const TART = ProductSku.of("TAR-002");
const FLAN = ProductSku.of("FLA-003");

/** Deux postes ; la quiche et la tarte à la Pâtisserie, places données. */
function pastry(positions: ReadonlyMap<string, number>): WorkstationMap {
  return WorkstationMap.rehydrate({
    workstations: [
      { id: "ws-pat", name: "Pâtisserie", position: 0, archivedAt: null, trackingLevel: null },
      { id: "ws-tou", name: "Tourier", position: 1, archivedAt: null, trackingLevel: null },
      { id: "ws-old", name: "Ancien", position: 2, archivedAt: AT, trackingLevel: null },
    ],
    placements: new Map(
      ["QUI-001", "TAR-002"].map((sku) => [
        sku,
        [{ workstationId: "ws-pat", finishes: true, position: positions.get(sku) ?? null }],
      ]),
    ),
  });
}

const SETTLED = new Map([
  ["QUI-001", 0],
  ["TAR-002", 1],
]);

describe("WorkstationMap — la pile d'un poste", () => {
  it("pose la place de chaque produit, du haut vers le bas, et n'écrit que ce qui change", () => {
    const map = pastry(new Map([["QUI-001", 0]]));
    map.reorderProducts("ws-pat", [QUICHE, TART]);
    expect(map.changes().placements).toEqual([
      {
        productSku: "TAR-002",
        workstationId: "ws-pat",
        station: { workstationId: "ws-pat", finishes: true, position: 1 },
      },
    ]);
    expect(map.positionOf("QUI-001")).toBe(0);
  });

  it("refuse une liste qui n'est pas exactement la pile du poste", () => {
    const map = pastry(SETTLED);
    expect(() => map.reorderProducts("ws-pat", [QUICHE])).toThrow(WorkstationOrderMismatchError);
    expect(() => map.reorderProducts("ws-pat", [QUICHE, TART, FLAN])).toThrow(
      WorkstationOrderMismatchError,
    );
    expect(() => map.reorderProducts("ws-pat", [QUICHE, QUICHE])).toThrow(
      WorkstationOrderMismatchError,
    );
    expect(() => map.reorderProducts("ws-tou", [QUICHE, TART])).toThrow(
      WorkstationOrderMismatchError,
    );
    expect(map.changes().placements).toEqual([]);
  });

  it("nomme le poste dans le refus, pour qu'on sache quelle pile a changé", () => {
    expect(() => pastry(SETTLED).reorderProducts("ws-pat", [TART])).toThrow(/« Pâtisserie »/);
  });

  it("refuse un poste archivé ou inconnu", () => {
    const map = pastry(SETTLED);
    expect(() => map.reorderProducts("ws-old", [])).toThrow(WorkstationArchivedError);
    expect(() => map.reorderProducts("ws-x", [])).toThrow(WorkstationNotFoundError);
  });

  it("met en bas de la pile un produit placé sur un poste réglé", () => {
    const map = pastry(SETTLED);
    map.place([FLAN], "ws-pat");
    expect(map.positionOf("FLA-003")).toBe(2);
  });

  it("met en bas de la pile du nouveau poste un produit qui change de poste", () => {
    const map = pastry(SETTLED);
    map.place([FLAN], "ws-tou");
    map.place([QUICHE], "ws-tou");
    expect([map.positionOf("FLA-003"), map.positionOf("QUI-001")]).toEqual([0, 1]);
    expect(map.changes().placements).toContainEqual({
      productSku: "QUI-001",
      workstationId: "ws-tou",
      station: { workstationId: "ws-tou", finishes: true, position: 1 },
    });
  });

  it("laisse sans place un produit qui rejoint une pile pas encore réglée", () => {
    // Une place numérotée le ferait passer au-dessus des produits sans place.
    const map = pastry(new Map([["QUI-001", 0]]));
    map.place([FLAN], "ws-pat");
    expect(map.positionOf("FLA-003")).toBeNull();
  });

  it("ne déplace pas un produit replacé sur son propre poste", () => {
    const map = pastry(SETTLED);
    map.place([QUICHE], "ws-pat");
    expect(map.positionOf("QUI-001")).toBe(0);
    expect(map.changes().placements).toEqual([]);
  });

  it("efface la ligne, place comprise, d'un produit remis « à ranger »", () => {
    const map = pastry(SETTLED);
    map.place([QUICHE], null);
    expect(map.positionOf("QUI-001")).toBeNull();
    expect(map.changes().placements).toEqual([
      { productSku: "QUI-001", workstationId: "ws-pat", station: null },
    ]);
    map.place([QUICHE], "ws-pat");
    expect(map.positionOf("QUI-001")).toBe(2);
  });
});
