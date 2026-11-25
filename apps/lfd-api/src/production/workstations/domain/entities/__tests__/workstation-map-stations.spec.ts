import {
  FinishingWorkstationStillNeededError,
  WorkstationArchivedError,
  WorkstationNotFoundError,
  WorkstationNotOfProductError,
  WorkstationStillUsedError,
} from "../../errors/workstation-errors.js";
import { ProductSku } from "../../value-objects/product-sku.js";
import type { ProductStation } from "../product-placements.js";
import { WorkstationMap } from "../workstation-map.js";

const AT = new Date(Date.UTC(2026, 0, 1));
const SANDWICH = ProductSku.of("SAN-001");
const BAGUETTE = ProductSku.of("BAG-002");

/** Boulangerie, Salé traiteur, et un poste archivé ; la baguette à la Boulangerie, place 0. */
function bakery(placements: ReadonlyMap<string, readonly ProductStation[]> = new Map()) {
  return WorkstationMap.rehydrate({
    workstations: [
      { id: "ws-bou", name: "Boulangerie", position: 0, archivedAt: null, trackingLevel: null },
      { id: "ws-sal", name: "Salé traiteur", position: 1, archivedAt: null, trackingLevel: null },
      { id: "ws-old", name: "Ancien", position: 2, archivedAt: AT, trackingLevel: null },
    ],
    placements: new Map([
      ["BAG-002", [{ workstationId: "ws-bou", finishes: true, position: 0 }]],
      ...placements,
    ]),
  });
}

/** Le sandwich : fini au Salé traiteur, étape à la Boulangerie. */
const SANDWICH_ON_TWO = new Map([
  [
    "SAN-001",
    [
      { workstationId: "ws-sal", finishes: true, position: 0 },
      { workstationId: "ws-bou", finishes: false, position: 1 },
    ],
  ],
]);

/** Un produit placé a exactement un poste qui finit. */
function finishersOf(map: WorkstationMap, product: string): number {
  return map.stationsOf(product).filter((station) => station.finishes).length;
}

describe("WorkstationMap — ajouter un poste à des produits", () => {
  it("le premier poste d'un produit le finit, le suivant est une étape en bas de sa pile", () => {
    const map = bakery();
    expect(map.addWorkstationToProducts([SANDWICH], "ws-sal")).toEqual({
      products: ["SAN-001"],
      finishing: ["SAN-001"],
    });
    expect(map.addWorkstationToProducts([SANDWICH], "ws-bou")).toEqual({
      products: ["SAN-001"],
      finishing: [],
    });
    expect(map.stationsOf("SAN-001")).toEqual([
      { workstationId: "ws-sal", finishes: true, position: 0 },
      { workstationId: "ws-bou", finishes: false, position: 1 },
    ]);
    expect(map.workstationOf("SAN-001")).toBe("ws-sal");
    expect(finishersOf(map, "SAN-001")).toBe(1);
  });

  it("n'ajoute rien à un produit qui a déjà ce poste", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.addWorkstationToProducts([SANDWICH, BAGUETTE], "ws-bou")).toEqual({
      products: [],
      finishing: [],
    });
    expect(map.changes()).toEqual({ workstations: [], placements: [] });
  });

  it("refuse un poste archivé ou inconnu", () => {
    const map = bakery();
    expect(() => map.addWorkstationToProducts([SANDWICH], "ws-old")).toThrow(
      WorkstationArchivedError,
    );
    expect(() => map.addWorkstationToProducts([SANDWICH], "ws-x")).toThrow(
      WorkstationNotFoundError,
    );
  });

  it("un poste d'étape porte le produit : il ne s'archive pas", () => {
    const map = bakery(SANDWICH_ON_TWO);
    map.place([BAGUETTE], "ws-sal");
    expect(() => map.archive("ws-bou", AT)).toThrow(WorkstationStillUsedError);
  });
});

describe("WorkstationMap — retirer un poste de produits", () => {
  it("retire une étape, et réécrit le poste quitté pour que le numéro de la carte monte", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.removeWorkstationFromProducts([SANDWICH], "ws-bou")).toEqual({
      products: ["SAN-001"],
      unplaced: [],
    });
    expect(map.stationsOf("SAN-001").map((station) => station.workstationId)).toEqual(["ws-sal"]);
    expect(map.changes().workstations.map((station) => station.id)).toEqual(["ws-bou"]);
    expect(map.changes().placements).toEqual([
      { productSku: "SAN-001", workstationId: "ws-bou", station: null },
    ]);
  });

  it("refuse de retirer celui qui finit tant qu'il reste d'autres postes, pour tout le geste", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(() => map.removeWorkstationFromProducts([BAGUETTE, SANDWICH], "ws-sal")).toThrow(
      FinishingWorkstationStillNeededError,
    );
    expect(() => map.removeWorkstationFromProducts([SANDWICH], "ws-sal")).toThrow(
      /« Salé traiteur » finit le produit SAN-001/,
    );
    expect(map.changes()).toEqual({ workstations: [], placements: [] });
  });

  it("retirer le dernier poste remet le produit « à ranger »", () => {
    const map = bakery();
    expect(map.removeWorkstationFromProducts([BAGUETTE, SANDWICH], "ws-bou")).toEqual({
      products: ["BAG-002"],
      unplaced: ["BAG-002"],
    });
    expect(map.workstationOf("BAG-002")).toBeNull();
    expect(map.placedCount()).toBe(0);
  });
});

describe("WorkstationMap — choisir le poste qui finit", () => {
  it("échange le poste qui finit : l'ancien devient une étape, les places restent", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.setFinishingWorkstation(SANDWICH, "ws-bou")).toBe("ws-sal");
    expect(map.stationsOf("SAN-001")).toEqual([
      { workstationId: "ws-bou", finishes: true, position: 1 },
      { workstationId: "ws-sal", finishes: false, position: 0 },
    ]);
    expect(finishersOf(map, "SAN-001")).toBe(1);
    // L'ancien en premier : la base n'admet qu'un poste qui finit à la fois.
    expect(map.changes().placements.map((change) => change.station?.finishes)).toEqual([
      false,
      true,
    ]);
  });

  it("ne change rien quand le poste finit déjà", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.setFinishingWorkstation(SANDWICH, "ws-sal")).toBeNull();
    expect(map.changes().placements).toEqual([]);
  });

  it("refuse un poste qui n'est pas un poste du produit, en le nommant", () => {
    const map = bakery(SANDWICH_ON_TWO);
    map.place([BAGUETTE], "ws-sal");
    expect(() => map.setFinishingWorkstation(BAGUETTE, "ws-bou")).toThrow(
      WorkstationNotOfProductError,
    );
    expect(() => map.setFinishingWorkstation(BAGUETTE, "ws-bou")).toThrow(/« Boulangerie »/);
  });
});

describe("WorkstationMap — placer garde son sens : un seul poste, qui finit", () => {
  it("place sur un seul poste un produit qui en avait deux, et réécrit le poste quitté", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.place([SANDWICH], "ws-bou")).toEqual(["SAN-001"]);
    // L'étape devenue seule garde sa place dans la pile.
    expect(map.stationsOf("SAN-001")).toEqual([
      { workstationId: "ws-bou", finishes: true, position: 1 },
    ]);
    expect(map.changes().workstations.map((station) => station.id)).toEqual(["ws-sal"]);
  });

  it("remet « à ranger » un produit à deux postes : ses deux lignes s'en vont", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.place([SANDWICH], null)).toEqual(["SAN-001"]);
    expect(map.stationsOf("SAN-001")).toEqual([]);
    expect(map.changes().placements.filter((change) => change.station === null)).toHaveLength(2);
  });

  it("la pile d'un poste compte ses produits d'étape", () => {
    const map = bakery(SANDWICH_ON_TWO);
    expect(map.reorderProducts("ws-bou", [SANDWICH, BAGUETTE])).toBe(true);
    expect(map.positionOf("SAN-001", "ws-bou")).toBe(0);
    expect(map.stationsOf("SAN-001")[1]).toEqual({
      workstationId: "ws-bou",
      finishes: false,
      position: 0,
    });
  });
});
