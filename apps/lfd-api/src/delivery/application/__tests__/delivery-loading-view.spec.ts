import type { BagRow, LoadingRoundRow } from "../../domain/ports/delivery-loading.reader.js";
import { bagViewsOf, loadingDayView, loadingRoundView } from "../delivery-loading-view.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const NAMES = { reference: "C-1", customerLabel: "Maison Colin" };

function bag(id: string, voidedAt: Date | null = null): BagRow {
  return { id, orderId: "o_1", code: id.toUpperCase().padEnd(6, "0"), voidedAt };
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

describe("bagViewsOf — « sac 2 / 3 »", () => {
  it("le rang et le total ne comptent que les sacs non annulés", () => {
    const views = bagViewsOf([bag("a"), bag("b", AT), bag("c")], NAMES);

    expect(views.map(({ index, total }) => ({ index, total }))).toEqual([
      { index: 1, total: 2 },
      { index: null, total: 2 },
      { index: 2, total: 2 },
    ]);
    expect(views[0]).toMatchObject({ reference: "C-1", customerLabel: "Maison Colin" });
  });
});

describe("loadingRoundView / loadingDayView — L4-C17", () => {
  const stops: LoadingRoundRow["stops"] = [
    { stopId: "s_1", orderId: "o_1", position: 1, bags: [], loaded: new Map() },
    {
      stopId: "s_2",
      orderId: "o_1",
      position: 2,
      bags: [bag("a"), bag("b")],
      loaded: new Map([["a", AT]]),
    },
    {
      stopId: "s_3",
      orderId: "o_1",
      position: 3,
      bags: [bag("a"), bag("x", AT)],
      loaded: new Map([["a", AT]]),
    },
  ];

  it("non étiqueté, partiel, chargé — un sac annulé ne manque pas", () => {
    const view = loadingRoundView(round(stops), new Map());

    expect(view.stops.map((stop) => stop.state)).toEqual(["unlabelled", "partial", "loaded"]);
    expect(view.stops[1]?.bags).toEqual([
      { bagId: "a", code: "A00000", index: 1, loadedAt: AT.toISOString() },
      { bagId: "b", code: "B00000", index: 2, loadedAt: null },
    ]);
    expect(view.stops[0]).toMatchObject({ reference: "", customerLabel: "" });
  });

  it("le jour compte les arrêts, et ceux qui sont chargés", () => {
    expect(loadingDayView(DAY, [round(stops)])).toEqual({
      day: DAY,
      rounds: [
        {
          roundId: "r_1",
          vehicleName: "Kangoo blanc",
          passage: 1,
          departedAt: null,
          stops: 3,
          loadedStops: 1,
        },
      ],
    });
  });
});
