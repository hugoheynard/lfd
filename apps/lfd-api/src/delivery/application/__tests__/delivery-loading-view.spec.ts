import type { StopPlace } from "../../domain/entities/shared-bin.js";
import type { BinRow, LoadingRoundRow } from "../../domain/ports/delivery-loading.reader.js";
import {
  type BinContext,
  binViewsOf,
  loadingDayView,
  loadingRoundView,
} from "../delivery-loading-view.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const BIN_M = { id: "t_m", name: "Bac M", isotherm: false, archived: false };

function bin(id: string, voidedAt: Date | null = null, overrides: Partial<BinRow> = {}): BinRow {
  return {
    id,
    orderId: "o_1",
    code: id.toUpperCase().padEnd(6, "0"),
    voidedAt,
    binType: BIN_M,
    half: null,
    physicalBinId: null,
    innerBags: 2,
    partner: null,
    ...overrides,
  };
}

function context(places: ReadonlyMap<string, StopPlace> = new Map()): BinContext {
  return {
    names: new Map([
      ["o_1", { reference: "C-1", customerLabel: "Maison Colin" }],
      ["o_2", { reference: "C-2", customerLabel: "Chez Lulu" }],
    ]),
    places,
  };
}

function round(stops: LoadingRoundRow["stops"]): LoadingRoundRow {
  return {
    id: "r_1",
    serviceDay: DAY,
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 2,
    departedAt: null,
    stops,
  };
}

/** Une moitié de `o_1`, dont l'autre moitié est à `o_2`. */
const SHARED = bin("h", null, {
  half: "left",
  physicalBinId: "p_1",
  partner: { binId: "h2", orderId: "o_2" },
});

describe("binViewsOf — « bac 2 / 3 »", () => {
  it("le rang et le total ne comptent que les bacs non annulés", () => {
    const views = binViewsOf([bin("a"), bin("b", AT), bin("c")], context());

    expect(views.map(({ index, total }) => ({ index, total }))).toEqual([
      { index: 1, total: 2 },
      { index: null, total: 2 },
      { index: 2, total: 2 },
    ]);
    expect(views[0]).toMatchObject({
      reference: "C-1",
      customerLabel: "Maison Colin",
      binType: BIN_M,
      half: null,
      innerBags: 2,
      sharedWith: null,
      toRedo: false,
    });
  });

  it("un bac partagé dit avec qui, et n'est pas à refaire aux arrêts voisins", () => {
    const places = new Map([
      ["o_1", { roundId: "r_1", rank: 0 }],
      ["o_2", { roundId: "r_1", rank: 1 }],
    ]);

    const [view] = binViewsOf([SHARED], context(places));

    expect(view).toMatchObject({
      half: "left",
      physicalBinId: "p_1",
      sharedWith: { binId: "h2", orderId: "o_2", reference: "C-2", customerLabel: "Chez Lulu" },
      toRedo: false,
    });
  });

  /** v2-4 : calculé à la lecture — un arrêt intercalé suffit, sans aucun geste sur le bac. */
  it("est à refaire dès que les deux arrêts ne sont plus voisins, ou pas dans la même tournée", () => {
    const apart = new Map([
      ["o_1", { roundId: "r_1", rank: 0 }],
      ["o_2", { roundId: "r_1", rank: 2 }],
    ]);
    const elsewhere = new Map([
      ["o_1", { roundId: "r_1", rank: 0 }],
      ["o_2", { roundId: "r_2", rank: 1 }],
    ]);

    expect(binViewsOf([SHARED], context(apart))[0]?.toRedo).toBe(true);
    expect(binViewsOf([SHARED], context(elsewhere))[0]?.toRedo).toBe(true);
    expect(binViewsOf([SHARED], context())[0]?.toRedo).toBe(true);
  });
});

describe("loadingRoundView / loadingDayView — L4-C17", () => {
  const stops: LoadingRoundRow["stops"] = [
    { stopId: "s_1", orderId: "o_1", position: 1, bins: [], loaded: new Map() },
    {
      stopId: "s_2",
      orderId: "o_1",
      position: 2,
      bins: [bin("a"), bin("b")],
      loaded: new Map([["a", AT]]),
    },
    {
      stopId: "s_3",
      orderId: "o_1",
      position: 3,
      bins: [bin("a"), bin("x", AT), SHARED],
      loaded: new Map([
        ["a", AT],
        ["h", AT],
      ]),
    },
  ];

  it("non étiqueté, partiel, chargé — un bac annulé ne manque pas", () => {
    const view = loadingRoundView(round(stops), context());

    expect(view.stops.map((stop) => stop.state)).toEqual(["unlabelled", "partial", "loaded"]);
    expect(view.stops[1]?.bins).toEqual([
      {
        binId: "a",
        code: "A00000",
        index: 1,
        binTypeName: "Bac M",
        half: null,
        innerBags: 2,
        sharedWithReference: null,
        toRedo: false,
        loadedAt: AT.toISOString(),
      },
      {
        binId: "b",
        code: "B00000",
        index: 2,
        binTypeName: "Bac M",
        half: null,
        innerBags: 2,
        sharedWithReference: null,
        toRedo: false,
        loadedAt: null,
      },
    ]);
    expect(view.stops[2]?.bins[1]).toMatchObject({ sharedWithReference: "C-2", toRedo: true });
  });

  it("le jour compte les arrêts, ceux qui sont chargés, et ceux qui ont un bac à refaire", () => {
    expect(loadingDayView(DAY, [round(stops)], new Map())).toEqual({
      day: DAY,
      rounds: [
        {
          roundId: "r_1",
          vehicleName: "Kangoo blanc",
          passage: 1,
          departedAt: null,
          stops: 3,
          loadedStops: 1,
          stopsWithBinToRedo: 1,
        },
      ],
    });
  });
});
