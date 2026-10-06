import { stopDemandOf } from "../stop-demand.js";
import { BAC_M } from "./capacity-fixtures.js";

const TYPES = new Map([[BAC_M.id, BAC_M]]);
const packed = (whole: number, half: boolean) => ({
  bins: [
    {
      binTypeId: BAC_M.id,
      cold: false,
      whole,
      half,
      lastFill: 1,
      lastContent: [],
      content: [],
    },
  ],
  unplaced: [],
});

describe("la demande en bacs d'une commande (CA4)", () => {
  it("les bacs déclarés font foi, même quand une estimation existe", () => {
    const demand = stopDemandOf({
      orderId: "o1",
      declared: [
        { id: "b1", binTypeId: BAC_M.id, half: null, physicalBinId: null },
        { id: "b2", binTypeId: BAC_M.id, half: "left", physicalBinId: "p1" },
      ],
      estimate: packed(9, false),
      binTypes: TYPES,
    });

    expect(demand.kind).toBe("declared");
    expect(demand.kind === "unknown" ? [] : demand.bins.map((bin) => bin.id)).toEqual(["b1", "b2"]);
  });

  it("sans bac déclaré, l'estimation du colisage ; une moitié compte pour un bac entier", () => {
    const demand = stopDemandOf({
      orderId: "o1",
      declared: [],
      estimate: packed(2, true),
      binTypes: TYPES,
    });

    expect(demand.kind).toBe("estimated");
    expect(demand.kind === "unknown" ? 0 : demand.bins.length).toBe(3);
    expect(demand.kind === "unknown" ? [] : demand.bins.map((bin) => bin.half)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("inconnue sans ligne, avec un produit sans contenance, ou sur un type introuvable — jamais inventée", () => {
    const base = { orderId: "o1", declared: [], binTypes: TYPES };

    expect(stopDemandOf({ ...base, estimate: null }).kind).toBe("unknown");
    expect(stopDemandOf({ ...base, estimate: { bins: [], unplaced: [] } }).kind).toBe("unknown");
    expect(
      stopDemandOf({
        ...base,
        estimate: {
          ...packed(1, false),
          unplaced: [{ sku: "X", quantity: 3, reason: "no_capacity" }],
        },
      }).kind,
    ).toBe("unknown");
    expect(stopDemandOf({ ...base, estimate: packed(1, false), binTypes: new Map() }).kind).toBe(
      "unknown",
    );
    expect(
      stopDemandOf({
        ...base,
        declared: [{ id: "b1", binTypeId: "disparu", half: null, physicalBinId: null }],
        estimate: null,
      }).kind,
    ).toBe("unknown");
  });
});
