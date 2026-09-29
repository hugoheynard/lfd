import { DeliveryBag, MAX_BAGS_PER_DECLARATION } from "../delivery-bag.js";
import { StopLoading, type StopLoadingSnapshot } from "../stop-loading.js";
import {
  BagLoadedError,
  DeliveryRoundDepartedError,
  InvalidBagCodeError,
  InvalidBagCountError,
} from "../../errors/delivery-loading-errors.js";

const AT = new Date(0);
const LATER = new Date(60_000);

function loadingOf(overrides: Partial<StopLoadingSnapshot> = {}): StopLoading {
  return StopLoading.restore({
    stopId: "s_1",
    roundId: "r_1",
    orderId: "o_1",
    serviceDay: "2030-03-12",
    vehicleName: "Kangoo blanc",
    passage: 1,
    departedAt: null,
    bags: [{ id: "b_1", code: "AAAAAA", voided: false }],
    loads: [],
    ...overrides,
  });
}

function bag(): DeliveryBag {
  return DeliveryBag.restore({
    id: "b_1",
    orderId: "o_1",
    code: "AAAAAA",
    voidedAt: null,
    createdAt: AT,
  });
}

describe("DeliveryBag.declare — un sac naît quand on le déclare (L4-C16)", () => {
  it("un sac par code, codes normalisés", () => {
    const bags = DeliveryBag.declare({
      orderId: "o_1",
      bags: [
        { id: "b_1", code: "a1b2c3" },
        { id: "b_2", code: "ZZZZZZ" },
      ],
      at: AT,
      loading: null,
    });

    expect(bags.map((declared) => declared.toSnapshot())).toEqual([
      { id: "b_1", orderId: "o_1", code: "A1B2C3", voidedAt: null, createdAt: AT },
      { id: "b_2", orderId: "o_1", code: "ZZZZZZ", voidedAt: null, createdAt: AT },
    ]);
  });

  it.each([0, MAX_BAGS_PER_DECLARATION + 1])("refuse %i sacs", (count) => {
    const bags = Array.from({ length: count }, (_, index) => ({
      id: `b_${String(index)}`,
      code: "AAAAAA",
    }));

    expect(() => DeliveryBag.declare({ orderId: "o_1", bags, at: AT, loading: null })).toThrow(
      InvalidBagCountError,
    );
  });

  it("refuse un code hors alphabet Crockford", () => {
    expect(() =>
      DeliveryBag.declare({
        orderId: "o_1",
        bags: [{ id: "b_1", code: "ILOU00" }],
        at: AT,
        loading: null,
      }),
    ).toThrow(InvalidBagCodeError);
  });

  it("refuse un sac de plus pour une tournée partie (I6)", () => {
    expect(() =>
      DeliveryBag.declare({
        orderId: "o_1",
        bags: [{ id: "b_2", code: "BBBBBB" }],
        at: LATER,
        loading: loadingOf({ departedAt: AT }),
      }),
    ).toThrow(DeliveryRoundDepartedError);
  });
});

describe("DeliveryBag.void — L4-C19", () => {
  it("annule un sac non chargé, ou d'une commande dans aucune tournée", () => {
    const subject = bag();

    expect(subject.void(LATER, null)).toBe(true);
    expect(subject.voidedAt).toEqual(LATER);
  });

  it("annuler deux fois n'écrit rien la seconde", () => {
    const subject = bag();
    subject.void(LATER, loadingOf());

    expect(subject.void(LATER, loadingOf())).toBe(false);
  });

  it("refuse un sac chargé : décharger d'abord", () => {
    const loaded = loadingOf({
      loads: [
        {
          id: "l_1",
          bagId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_1",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(() => bag().void(LATER, loaded)).toThrow(BagLoadedError);
  });

  it("refuse après le départ de sa tournée", () => {
    expect(() => bag().void(LATER, loadingOf({ departedAt: AT }))).toThrow(
      DeliveryRoundDepartedError,
    );
  });
});
