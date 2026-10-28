import type { DriverTransferStopRow } from "../../domain/ports/driver-rounds.reader.js";
import { driverTransferStopsOf } from "../my-round-transfer-stops.js";
import {
  FixedTransferBinCounts,
  FixedTransferContents,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "./transfer-doubles.js";
import { FixedTransferSitePlaces, VAL_VILLAGE_PLACE } from "./transfer-site-places-double.js";
import { resupplyContentsOver } from "./resupply-transfer-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);

const LINES = new Map([
  ["o_1", [{ sku: "PAIN", name: "Pain", quantity: 2, saleUnit: "piece" as const }]],
  ["o_2", [{ sku: "PAIN", name: "Pain", quantity: 3, saleUnit: "piece" as const }]],
]);

function rowOf(transferId: string): DriverTransferStopRow {
  return {
    stopId: `s_${transferId}`,
    transferId,
    position: 2,
    closedAt: null,
    siteLabel: "Val Village",
    orderCount: 2,
    receivedAt: null,
  };
}

function sourcesOver(
  transfers: InMemoryInternalTransfers,
  places = new FixedTransferSitePlaces([VAL_VILLAGE_PLACE]),
) {
  return {
    transfers: new InternalTransfersReaderOver(transfers),
    contents: new FixedTransferContents(LINES),
    resupplies: resupplyContentsOver(),
    bins: new FixedTransferBinCounts(new Map([["t_1", 3]])),
    places,
  };
}

describe("driverTransferStopsOf — ce que le livreur lit de son transfert", () => {
  it("porte le manifeste détaillé, les bacs et le lieu du site", async () => {
    const transfers = new InMemoryInternalTransfers(
      plannedTransfer("t_1", DAY, AT, ["o_1", "o_2"]),
    );

    const [view] = await driverTransferStopsOf([rowOf("t_1")], sourcesOver(transfers));

    expect(view).toMatchObject({
      stopId: "s_t_1",
      binCount: 3,
      siteAddress: VAL_VILLAGE_PLACE.address,
      siteGps: VAL_VILLAGE_PLACE.gps,
      totals: [{ sku: "PAIN", productName: "Pain", quantity: 5 }],
    });
    expect(view?.orders.items.map((item) => item.subjectId)).toEqual(["o_1", "o_2"]);
    expect(view?.resupplies).toEqual({ items: [], totals: [] });
  });

  it("un site que le commerce ne connaît pas : ni adresse ni point, rien d'inventé", async () => {
    const transfers = new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_1"]));

    const [view] = await driverTransferStopsOf(
      [rowOf("t_1")],
      sourcesOver(transfers, new FixedTransferSitePlaces()),
    );

    expect(view).toMatchObject({ siteAddress: null, siteGps: null });
  });

  it("un transfert introuvable : sections vides, zéro bac", async () => {
    const [view] = await driverTransferStopsOf(
      [rowOf("t_x")],
      sourcesOver(new InMemoryInternalTransfers()),
    );

    expect(view).toMatchObject({
      binCount: 0,
      totals: [],
      orders: { items: [], totals: [] },
      siteAddress: null,
    });
  });

  it("sans arrêt de transfert, ne lit rien", async () => {
    const places = new FixedTransferSitePlaces([VAL_VILLAGE_PLACE]);

    expect(
      await driverTransferStopsOf([], sourcesOver(new InMemoryInternalTransfers(), places)),
    ).toEqual([]);
    expect(places.asked).toEqual([]);
  });
});
