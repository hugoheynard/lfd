import type { LoadingStopRow } from "../../domain/ports/delivery-loading.reader.js";
import { resuppliesAfterLoadingOf } from "../transfer-late-resupplies.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const LOADED = new Date(5_000);

function transferStop(
  loaded: ReadonlyMap<string, Date>,
  resuppliesAttachedAt: readonly Date[],
): LoadingStopRow {
  return {
    kind: "transfer",
    transferId: "tr_1",
    stopId: "st_1",
    siteLabel: "Val Village",
    siteId: "site_vv",
    position: 0,
    bins: [],
    loaded,
    resuppliesAttachedAt,
  };
}

describe("resuppliesAfterLoadingOf (R4c)", () => {
  it("compte les réassorts rangés après le dernier bac chargé", () => {
    const stop = transferStop(
      new Map([
        ["b1", new Date(1_000)],
        ["b2", LOADED],
      ]),
      [new Date(2_000), new Date(6_000)],
    );

    expect(resuppliesAfterLoadingOf(stop)).toBe(1);
  });

  it("rien de chargé : rien à signaler", () => {
    expect(resuppliesAfterLoadingOf(transferStop(new Map(), [new Date(6_000)]))).toBe(0);
  });

  it("un bac chargé après le réassort efface le signal", () => {
    const stop = transferStop(new Map([["b3", new Date(7_000)]]), [new Date(6_000)]);

    expect(resuppliesAfterLoadingOf(stop)).toBe(0);
  });
});
