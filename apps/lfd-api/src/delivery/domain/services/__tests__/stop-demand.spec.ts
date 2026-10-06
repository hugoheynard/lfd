import { stopDemandOf } from "../stop-demand.js";
import { BAC_M, MANNE } from "./capacity-fixtures.js";

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
      defaultBins: null,
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
      defaultBins: null,
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
    const base = { orderId: "o1", declared: [], binTypes: TYPES, defaultBins: null };

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

  describe("le contenant par défaut des réglages (2026-10-06)", () => {
    const base = {
      orderId: "o1",
      declared: [],
      binTypes: TYPES,
      defaultBins: { binType: MANNE, count: 1 },
    };
    const partial = {
      ...packed(2, false),
      unplaced: [{ sku: "X", quantity: 3, reason: "no_capacity" as const }],
    };
    const typesOf = (demand: ReturnType<typeof stopDemandOf>) =>
      demand.kind === "unknown" ? [] : demand.bins.map((bin) => bin.binType.id);

    it("une commande sans ligne compte pour le défaut, et le dit", () => {
      const demand = stopDemandOf({ ...base, estimate: null });

      expect(demand).toMatchObject({ kind: "defaulted", withEstimate: false });
      expect(typesOf(demand)).toEqual([MANNE.id]);
    });

    it("le défaut ne passe jamais devant les bacs déclarés ni une estimation complète", () => {
      expect(
        stopDemandOf({
          ...base,
          declared: [{ id: "b1", binTypeId: BAC_M.id, half: null, physicalBinId: null }],
          estimate: null,
        }).kind,
      ).toBe("declared");
      expect(stopDemandOf({ ...base, estimate: packed(1, false) }).kind).toBe("estimated");
    });

    it("en partie estimable : la part estimée PLUS le défaut, jamais moins que l'un ou l'autre", () => {
      const demand = stopDemandOf({ ...base, estimate: partial });

      expect(demand).toMatchObject({ kind: "defaulted", withEstimate: true });
      expect(typesOf(demand)).toEqual([BAC_M.id, BAC_M.id, MANNE.id]);
    });

    it("compte autant de bacs que le réglage, chacun d'identifiant distinct", () => {
      const demand = stopDemandOf({
        ...base,
        estimate: null,
        defaultBins: { binType: MANNE, count: 3 },
      });

      const ids = demand.kind === "unknown" ? [] : demand.bins.map((bin) => bin.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("un type d'estimation introuvable : le défaut seul", () => {
      const demand = stopDemandOf({ ...base, estimate: packed(1, false), binTypes: new Map() });

      expect(demand).toMatchObject({ kind: "defaulted", withEstimate: false });
      expect(typesOf(demand)).toEqual([MANNE.id]);
    });

    it("des bacs déclarés au type introuvable restent inconnus : le défaut ne les recouvre pas", () => {
      expect(
        stopDemandOf({
          ...base,
          declared: [{ id: "b1", binTypeId: "disparu", half: null, physicalBinId: null }],
          estimate: null,
        }).kind,
      ).toBe("unknown");
    });
  });
});
