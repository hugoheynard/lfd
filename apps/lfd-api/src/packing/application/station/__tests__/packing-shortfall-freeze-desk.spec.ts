import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import {
  NothingShortError,
  ShortfallAlreadyAuthorizedError,
} from "../../../domain/errors/packing-shortfall-errors.js";
import { ContainersCountedError } from "../../../domain/errors/packing-container-errors.js";
import {
  PackedOrderSealedError,
  PackingOrderNotDrawnYetError,
} from "../../../domain/errors/packing-station-errors.js";
import { InMemorySheets } from "../../__tests__/station-doubles.js";
import { PackingShortfallFreezeDesk } from "../packing-shortfall-freeze-desk.js";

// Des jours et des instants comparés entre eux, jamais à l'horloge.
const DAY = "2030-03-12";
const LATER_DAY = "2030-03-13";
const FIRST = new Date(1_000);
const NOW = new Date(2_000);

/** Un bac de retrait : `held` croissants sur 4 au contenant. */
function sheet(held: number, overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 1,
    lines: [
      {
        sku: "CRO",
        productName: "Croissant",
        quantity: 4,
        packed: held >= 4 ? { at: FIRST, by: "s1", initials: "" } : null,
        saleUnit: "piece",
      },
    ],
    containerMode: "listed",
    containerList: [
      {
        id: "ctn_1",
        nature: "bin",
        bin: { binId: "bin_1", code: "AB12", half: null },
        opened: { at: FIRST, by: "s1" },
        voided: null,
        lines: [{ sku: "CRO", quantity: held }],
      },
    ],
    fulfillmentMethod: "pickup",
    ...overrides,
  };
}

function setup(...snapshots: readonly PackingSheetSnapshot[]) {
  const sheets = new InMemorySheets();
  for (const snapshot of snapshots) {
    sheets.put(snapshot);
  }
  return { sheets, desk: new PackingShortfallFreezeDesk(sheets, new FixedClock(NOW)) };
}

describe("PackingShortfallFreezeDesk — le bac figé pour le comptoir, sans fait", () => {
  it("rend les quantités au bac et pose la marque « manque » sur la fiche", async () => {
    const { desk, sheets } = setup(sheet(3));

    const lines = await desk.freeze("ord_1", 1);

    expect(lines).toEqual([{ sku: "CRO", due: 4, packed: 3 }]);
    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt).toEqual(NOW);
  });

  it("lit la fiche la plus récente de l'envoi", async () => {
    const { desk, sheets } = setup(sheet(1), sheet(2, { serviceDay: LATER_DAY }));

    const lines = await desk.freeze("ord_1", 1);

    expect(lines).toEqual([{ sku: "CRO", due: 4, packed: 2 }]);
    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt ?? null).toBeNull();
  });

  it("refuse une commande pas encore tirée au colisage", async () => {
    const { desk } = setup();

    await expect(desk.freeze("ord_1", 1)).rejects.toBeInstanceOf(PackingOrderNotDrawnYetError);
  });

  it("refuse un bac où rien ne manque", async () => {
    const { desk, sheets } = setup(sheet(4));

    await expect(desk.freeze("ord_1", 1)).rejects.toBeInstanceOf(NothingShortError);
    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt ?? null).toBeNull();
  });

  it("refuse un bac fermé, un comptage par contenants, un départ déjà décidé", async () => {
    await expect(
      setup(sheet(3, { packed: { at: FIRST, by: "s1" } })).desk.freeze("ord_1", 1),
    ).rejects.toBeInstanceOf(PackedOrderSealedError);
    await expect(
      setup(sheet(3, { containerMode: "counted" })).desk.freeze("ord_1", 1),
    ).rejects.toBeInstanceOf(ContainersCountedError);
    await expect(
      setup(sheet(3, { shortfallAuthorizedAt: FIRST })).desk.freeze("ord_1", 1),
    ).rejects.toBeInstanceOf(ShortfallAlreadyAuthorizedError);
  });
});
