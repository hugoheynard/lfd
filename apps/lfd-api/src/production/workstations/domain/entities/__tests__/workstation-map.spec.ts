import {
  InvalidWorkstationNameError,
  WorkstationArchivedError,
  WorkstationNameTakenError,
  WorkstationNotFoundError,
  WorkstationOrderMismatchError,
  WorkstationStillUsedError,
} from "../../errors/workstation-errors.js";
import { ProductSku } from "../../value-objects/product-sku.js";
import { WorkstationMap } from "../workstation-map.js";

const AT = new Date(Date.UTC(2026, 0, 1));
const QUICHE = ProductSku.of("QUI-001");
const TART = ProductSku.of("TAR-002");

function withTwo(): WorkstationMap {
  const map = WorkstationMap.empty();
  map.declare("ws-pat", "Pâtisserie");
  map.declare("ws-tou", "Tourier");
  return map;
}

describe("WorkstationMap — les postes", () => {
  it("range un poste neuf en dernier", () => {
    const map = withTwo();
    expect(map.active().map((station) => [station.name, station.position])).toEqual([
      ["Pâtisserie", 0],
      ["Tourier", 1],
    ]);
  });

  it("refuse un nom déjà pris, sans tenir compte de la casse ni des espaces", () => {
    const map = withTwo();
    expect(() => map.declare("ws-x", "  pâtisserie ")).toThrow(WorkstationNameTakenError);
  });

  it("refuse un nom vide ou trop long", () => {
    const map = WorkstationMap.empty();
    expect(() => map.declare("ws-x", "   ")).toThrow(InvalidWorkstationNameError);
    expect(() => map.declare("ws-x", "x".repeat(41))).toThrow(InvalidWorkstationNameError);
  });

  it("renomme un poste en gardant son propre nom libre", () => {
    const map = withTwo();
    map.rename("ws-pat", "PÂTISSERIE");
    expect(map.active()[0]?.name).toBe("PÂTISSERIE");
    expect(() => map.rename("ws-tou", "pâtisserie")).toThrow(WorkstationNameTakenError);
  });

  it("réordonne exactement les postes en service, et rien d'autre", () => {
    const map = withTwo();
    map.reorder(["ws-tou", "ws-pat"]);
    expect(map.active().map((station) => station.id)).toEqual(["ws-tou", "ws-pat"]);
    expect(() => map.reorder(["ws-tou"])).toThrow(WorkstationOrderMismatchError);
    expect(() => map.reorder(["ws-tou", "ws-tou"])).toThrow(WorkstationOrderMismatchError);
    expect(() => map.reorder(["ws-tou", "ws-inconnu"])).toThrow(WorkstationOrderMismatchError);
  });

  it("libère le nom d'un poste archivé", () => {
    const map = withTwo();
    map.archive("ws-pat", AT);
    expect(map.active().map((station) => station.id)).toEqual(["ws-tou"]);
    expect(() => map.declare("ws-new", "Pâtisserie")).not.toThrow();
  });
});

describe("WorkstationMap — les refus de l'archivage", () => {
  it("n'archive pas un poste qui porte des produits", () => {
    const map = withTwo();
    map.place([QUICHE, TART], "ws-pat");
    expect(() => map.archive("ws-pat", AT)).toThrow(WorkstationStillUsedError);
  });

  it("n'archive pas deux fois, et ne connaît pas un poste inconnu", () => {
    const map = withTwo();
    map.archive("ws-tou", AT);
    expect(() => map.archive("ws-tou", AT)).toThrow(WorkstationArchivedError);
    expect(() => map.archive("ws-inconnu", AT)).toThrow(WorkstationNotFoundError);
  });
});

describe("WorkstationMap — le poste d'un produit", () => {
  it("place, déplace et remet à ranger", () => {
    const map = withTwo();
    map.place([QUICHE], "ws-pat");
    expect(map.workstationOf("QUI-001")).toBe("ws-pat");
    map.place([QUICHE], "ws-tou");
    expect(map.workstationOf("QUI-001")).toBe("ws-tou");
    map.place([QUICHE], null);
    expect(map.workstationOf("QUI-001")).toBeNull();
    expect(map.placedCount()).toBe(0);
  });

  it("ne place rien sur un poste archivé ou inconnu", () => {
    const map = withTwo();
    map.archive("ws-tou", AT);
    expect(() => map.place([QUICHE], "ws-tou")).toThrow(WorkstationArchivedError);
    expect(() => map.place([QUICHE], "ws-inconnu")).toThrow(WorkstationNotFoundError);
    expect(map.placedCount()).toBe(0);
  });
});

describe("WorkstationMap — la différence à écrire", () => {
  it("ne rend que ce qui a changé depuis la relecture", () => {
    const map = WorkstationMap.rehydrate({
      workstations: [
        { id: "ws-pat", name: "Pâtisserie", position: 0, archivedAt: null },
        { id: "ws-tou", name: "Tourier", position: 1, archivedAt: null },
      ],
      placements: new Map([
        ["QUI-001", "ws-pat"],
        ["TAR-002", "ws-pat"],
      ]),
    });
    map.place([QUICHE], "ws-pat");
    map.place([TART], null);
    map.rename("ws-tou", "Tourière");
    map.rename("ws-pat", " Pâtisserie ");
    const changes = map.changes();
    expect(changes.workstations.map((station) => station.name)).toEqual(["Tourière"]);
    expect([...changes.placements]).toEqual([["TAR-002", null]]);
  });
});
