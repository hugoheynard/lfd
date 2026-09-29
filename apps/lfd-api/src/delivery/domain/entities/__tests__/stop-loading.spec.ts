import { StopLoading, type StopLoadingSnapshot } from "../stop-loading.js";
import {
  BinInOtherRoundError,
  BinVoidedError,
  DeliveryBinNotFoundError,
  DeliveryRoundDepartedError,
} from "../../errors/delivery-loading-errors.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);

function loading(overrides: Partial<StopLoadingSnapshot> = {}): StopLoading {
  return StopLoading.restore({
    stopId: "s_1",
    roundId: "r_1",
    orderId: "o_1",
    serviceDay: DAY,
    vehicleName: "Kangoo blanc",
    passage: 1,
    departedAt: null,
    roundOrderIds: ["o_1"],
    bins: [
      { id: "b_1", code: "AAAAAA", voided: false, partnerOrderId: null },
      { id: "b_2", code: "BBBBBB", voided: false, partnerOrderId: null },
      { id: "b_3", code: "CCCCCC", voided: true, partnerOrderId: null },
    ],
    loads: [],
    ...overrides,
  });
}

const gesture = { roundId: "r_1", loadId: "l_new", via: "scan", by: "staff_1", at: LATER } as const;

describe("StopLoading — le chargement appartient à l'arrêt (L4-C18)", () => {
  it("un arrêt sans bac est non étiqueté, pas chargé (L4-C17)", () => {
    expect(loading({ bins: [] }).state).toBe("unlabelled");
  });

  it("un bac annulé ne compte pas : chargé quand les bacs VIVANTS le sont", () => {
    const subject = loading();

    subject.load({ ...gesture, binId: "b_1" });
    expect(subject.state).toBe("partial");
    subject.load({ ...gesture, binId: "b_2", loadId: "l_2" });
    expect(subject.state).toBe("loaded");
    expect(subject.liveBinCount).toBe(2);
  });

  it("charger deux fois le même bac ne compte qu'une fois, et n'écrit rien la seconde", () => {
    const subject = loading({
      loads: [
        {
          id: "l_1",
          binId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_0",
          loadedVia: "code",
          createdAt: AT,
        },
      ],
    });

    expect(subject.load({ ...gesture, binId: "b_1" })).toBe(false);
    expect(subject.changedLoads()).toEqual([]);
  });

  it("écrit la ligne avec son auteur et son moyen", () => {
    const subject = loading();

    expect(subject.load({ ...gesture, binId: "b_1", via: "code" })).toBe(true);
    expect(subject.changedLoads()).toEqual([
      {
        id: "l_new",
        binId: "b_1",
        loadedAt: LATER,
        loadedBy: "staff_1",
        loadedVia: "code",
        createdAt: LATER,
      },
    ]);
  });

  it("un bac déchargé puis rechargé réutilise sa ligne", () => {
    const subject = loading({
      loads: [
        { id: "l_1", binId: "b_1", loadedAt: null, loadedBy: null, loadedVia: null, createdAt: AT },
      ],
    });

    subject.load({ ...gesture, binId: "b_1" });

    expect(subject.changedLoads()[0]).toMatchObject({ id: "l_1", createdAt: AT, loadedAt: LATER });
  });

  it("refuse un bac d'une autre tournée, en nommant le véhicule et le jour", () => {
    expect(() => loading().load({ ...gesture, roundId: "r_autre", binId: "b_1" })).toThrow(
      BinInOtherRoundError,
    );
    expect(() => loading().load({ ...gesture, roundId: "r_autre", binId: "b_1" })).toThrow(
      /« Kangoo blanc », le 2030-03-12/u,
    );
  });

  it("refuse un bac annulé", () => {
    expect(() => loading().load({ ...gesture, binId: "b_3" })).toThrow(BinVoidedError);
  });

  it("refuse un bac qui n'est pas de la commande", () => {
    expect(() => loading().load({ ...gesture, binId: "b_x" })).toThrow(DeliveryBinNotFoundError);
  });

  it("refuse de charger et de décharger après le départ (I6)", () => {
    const departed = loading({
      departedAt: AT,
      loads: [
        {
          id: "l_1",
          binId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_0",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(() => departed.load({ ...gesture, binId: "b_2" })).toThrow(DeliveryRoundDepartedError);
    expect(() => departed.unload({ roundId: "r_1", binId: "b_1" })).toThrow(
      DeliveryRoundDepartedError,
    );
  });

  it("décharger efface les trois colonnes et rend qui avait chargé", () => {
    const subject = loading({
      loads: [
        {
          id: "l_1",
          binId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_0",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(subject.unload({ roundId: "r_1", binId: "b_1" })).toEqual({
      loadedAt: AT,
      loadedBy: "staff_0",
      loadedVia: "scan",
    });
    expect(subject.changedLoads()).toEqual([
      { id: "l_1", binId: "b_1", loadedAt: null, loadedBy: null, loadedVia: null, createdAt: AT },
    ]);
    expect(subject.hasLoadedBin).toBe(false);
  });

  it("décharger un bac qui n'était pas chargé n'écrit rien", () => {
    const subject = loading();

    expect(subject.unload({ roundId: "r_1", binId: "b_1" })).toBeNull();
    expect(subject.changedLoads()).toEqual([]);
  });
});

describe("StopLoading — le bac partagé « à refaire » (lot 4 bis, v2-4)", () => {
  const shared = (partnerOrderId: string, voided = false) => ({
    id: "h_1",
    code: "HHHHHH",
    voided,
    partnerOrderId,
  });

  it("n'est pas à refaire tant que l'autre commande est à l'arrêt voisin", () => {
    const subject = loading({ roundOrderIds: ["o_0", "o_1", "o_2"], bins: [shared("o_2")] });

    expect(subject.binsToRedo).toEqual([]);
    expect(subject.isConsecutiveTo("o_0")).toBe(true);
    expect(subject.isConsecutiveTo("o_2")).toBe(true);
  });

  /** Un déplacement, un réordonnancement ou un retrait les a séparées. */
  it("est à refaire dès qu'un arrêt s'intercale, ou que l'autre a quitté la tournée", () => {
    expect(
      loading({ roundOrderIds: ["o_1", "o_x", "o_2"], bins: [shared("o_2")] }).binsToRedo,
    ).toEqual(["HHHHHH"]);
    expect(loading({ roundOrderIds: ["o_1"], bins: [shared("o_2")] }).binsToRedo).toEqual([
      "HHHHHH",
    ]);
  });

  it("un bac annulé, ou non partagé, n'est jamais à refaire", () => {
    const subject = loading({
      roundOrderIds: ["o_1"],
      bins: [
        shared("o_2", true),
        { id: "b_1", code: "AAAAAA", voided: false, partnerOrderId: null },
      ],
    });

    expect(subject.binsToRedo).toEqual([]);
  });
});
