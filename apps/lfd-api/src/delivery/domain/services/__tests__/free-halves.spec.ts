import type { BinRow, LoadingStopRow } from "../../ports/delivery-loading.reader.js";
import { freeHalvesAround } from "../free-halves.js";

const TYPE = { id: "bin_m", name: "Bac M", isotherm: false, archived: false };

function bin(id: string, orderId: string, overrides: Partial<BinRow> = {}): BinRow {
  return {
    id,
    orderId,
    code: id.toUpperCase(),
    voidedAt: null,
    binType: TYPE,
    half: "left",
    physicalBinId: `phys_${id}`,
    innerBags: 0,
    partner: null,
    ...overrides,
  };
}

function stop(orderId: string, position: number, bins: readonly BinRow[] = []): LoadingStopRow {
  return { stopId: `stop_${orderId}`, orderId, position, bins, loaded: new Map() };
}

describe("les moitiés libres autour d'une commande (v2-4)", () => {
  it("ne propose que celles des arrêts consécutifs, côté opposé", () => {
    const stops = [
      stop("o1", 1, [bin("a", "o1")]),
      stop("o2", 2, [bin("b", "o2", { half: "right" })]),
      stop("o3", 3),
      stop("o4", 4, [bin("d", "o4")]),
    ];

    const found = freeHalvesAround(stops, "o3");

    expect(found.map(({ bin: { id }, freeHalf }) => ({ id, freeHalf }))).toEqual([
      { id: "b", freeHalf: "left" },
      { id: "d", freeHalf: "right" },
    ]);
  });

  it("écarte un bac entier, une moitié annulée, prise, ou d'un type archivé", () => {
    const stops = [
      stop("o1", 1, [
        bin("whole", "o1", { half: null, physicalBinId: null }),
        bin("voided", "o1", { voidedAt: new Date(0) }),
        bin("shared", "o1", { partner: { binId: "x", orderId: "o9" } }),
        bin("old", "o1", { binType: { ...TYPE, archived: true } }),
        // Les deux moitiés du même bac pour la même commande : rien de libre.
        bin("mine-l", "o1", { physicalBinId: "phys_mine" }),
        bin("mine-r", "o1", { half: "right", physicalBinId: "phys_mine" }),
      ]),
      stop("o2", 2),
    ];

    expect(freeHalvesAround(stops, "o2")).toEqual([]);
  });

  it("une commande hors de la tournée : rien", () => {
    expect(freeHalvesAround([stop("o1", 1, [bin("a", "o1")])], "o2")).toEqual([]);
  });
});
