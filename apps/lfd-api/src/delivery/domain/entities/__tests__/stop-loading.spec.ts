import { StopLoading, type StopLoadingSnapshot } from "../stop-loading.js";
import {
  BagInOtherRoundError,
  BagVoidedError,
  DeliveryBagNotFoundError,
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
    bags: [
      { id: "b_1", code: "AAAAAA", voided: false },
      { id: "b_2", code: "BBBBBB", voided: false },
      { id: "b_3", code: "CCCCCC", voided: true },
    ],
    loads: [],
    ...overrides,
  });
}

const gesture = { roundId: "r_1", loadId: "l_new", via: "scan", by: "staff_1", at: LATER } as const;

describe("StopLoading — le chargement appartient à l'arrêt (L4-C18)", () => {
  it("un arrêt sans sac est non étiqueté, pas chargé (L4-C17)", () => {
    expect(loading({ bags: [] }).state).toBe("unlabelled");
  });

  it("un sac annulé ne compte pas : chargé quand les sacs VIVANTS le sont", () => {
    const subject = loading();

    subject.load({ ...gesture, bagId: "b_1" });
    expect(subject.state).toBe("partial");
    subject.load({ ...gesture, bagId: "b_2", loadId: "l_2" });
    expect(subject.state).toBe("loaded");
    expect(subject.liveBagCount).toBe(2);
  });

  it("charger deux fois le même sac ne compte qu'une fois, et n'écrit rien la seconde", () => {
    const subject = loading({
      loads: [
        {
          id: "l_1",
          bagId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_0",
          loadedVia: "code",
          createdAt: AT,
        },
      ],
    });

    expect(subject.load({ ...gesture, bagId: "b_1" })).toBe(false);
    expect(subject.changedLoads()).toEqual([]);
  });

  it("écrit la ligne avec son auteur et son moyen", () => {
    const subject = loading();

    expect(subject.load({ ...gesture, bagId: "b_1", via: "code" })).toBe(true);
    expect(subject.changedLoads()).toEqual([
      {
        id: "l_new",
        bagId: "b_1",
        loadedAt: LATER,
        loadedBy: "staff_1",
        loadedVia: "code",
        createdAt: LATER,
      },
    ]);
  });

  it("un sac déchargé puis rechargé réutilise sa ligne", () => {
    const subject = loading({
      loads: [
        { id: "l_1", bagId: "b_1", loadedAt: null, loadedBy: null, loadedVia: null, createdAt: AT },
      ],
    });

    subject.load({ ...gesture, bagId: "b_1" });

    expect(subject.changedLoads()[0]).toMatchObject({ id: "l_1", createdAt: AT, loadedAt: LATER });
  });

  it("refuse un sac d'une autre tournée, en nommant le véhicule et le jour", () => {
    expect(() => loading().load({ ...gesture, roundId: "r_autre", bagId: "b_1" })).toThrow(
      BagInOtherRoundError,
    );
    expect(() => loading().load({ ...gesture, roundId: "r_autre", bagId: "b_1" })).toThrow(
      /« Kangoo blanc », le 2030-03-12/u,
    );
  });

  it("refuse un sac annulé", () => {
    expect(() => loading().load({ ...gesture, bagId: "b_3" })).toThrow(BagVoidedError);
  });

  it("refuse un sac qui n'est pas de la commande", () => {
    expect(() => loading().load({ ...gesture, bagId: "b_x" })).toThrow(DeliveryBagNotFoundError);
  });

  it("refuse de charger et de décharger après le départ (I6)", () => {
    const departed = loading({
      departedAt: AT,
      loads: [
        {
          id: "l_1",
          bagId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_0",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(() => departed.load({ ...gesture, bagId: "b_2" })).toThrow(DeliveryRoundDepartedError);
    expect(() => departed.unload({ roundId: "r_1", bagId: "b_1" })).toThrow(
      DeliveryRoundDepartedError,
    );
  });

  it("décharger efface les trois colonnes et rend qui avait chargé", () => {
    const subject = loading({
      loads: [
        {
          id: "l_1",
          bagId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_0",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(subject.unload({ roundId: "r_1", bagId: "b_1" })).toEqual({
      loadedAt: AT,
      loadedBy: "staff_0",
      loadedVia: "scan",
    });
    expect(subject.changedLoads()).toEqual([
      { id: "l_1", bagId: "b_1", loadedAt: null, loadedBy: null, loadedVia: null, createdAt: AT },
    ]);
    expect(subject.hasLoadedBag).toBe(false);
  });

  it("décharger un sac qui n'était pas chargé n'écrit rien", () => {
    const subject = loading();

    expect(subject.unload({ roundId: "r_1", bagId: "b_1" })).toBeNull();
    expect(subject.changedLoads()).toEqual([]);
  });
});
