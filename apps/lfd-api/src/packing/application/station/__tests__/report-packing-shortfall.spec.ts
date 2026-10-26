import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import { NothingShortError } from "../../../domain/errors/packing-shortfall-errors.js";
import { PackingOrderNotDrawnYetError } from "../../../domain/errors/packing-station-errors.js";
import { InMemorySheets, RecordingDurable } from "../../__tests__/station-doubles.js";
import { ClosePackingOrderCommand } from "../close-packing-order.command.js";
import { ClosePackingOrderHandler } from "../close-packing-order.handler.js";
import { ReportPackingShortfallCommand } from "../report-packing-shortfall.command.js";
import { ReportPackingShortfallHandler } from "../report-packing-shortfall.handler.js";

// Un jour et des instants comparés entre eux, jamais à l'horloge.
const DAY = "2030-03-12";
const FIRST = new Date(1_000);
const LATER = new Date(2_000);
const REPORTED = "packing.shortfall_reported";
const CLEARED = "packing.shortfall_cleared";

/** Un bac de livraison : 3 croissants sur 4 au contenant. */
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
    fulfillmentMethod: "delivery",
    ...overrides,
  };
}

function setup(snapshot: PackingSheetSnapshot) {
  const sheets = new InMemorySheets();
  sheets.put(snapshot);
  const durable = new RecordingDurable();
  const clock = new FixedClock(FIRST);
  const uow = new DirectUnitOfWork();
  return {
    sheets,
    durable,
    clock,
    report: new ReportPackingShortfallHandler(sheets, durable, clock, uow),
    close: new ClosePackingOrderHandler(sheets, durable, clock, uow),
  };
}

describe("ReportPackingShortfallHandler — « Il manque » au colisage", () => {
  it("retient le signalement sur le bac et publie les quantités au bac, sous une clé datée", async () => {
    const { report, sheets, durable } = setup(sheet(3));

    await report.execute(new ReportPackingShortfallCommand(DAY, "ord_1", "s2"));

    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt).toEqual(FIRST);
    expect(sheets.of(DAY, "ord_1")?.packed).toBeNull();
    expect(durable.of(REPORTED).map((fact) => [fact.key, fact.payload])).toEqual([
      [
        `${REPORTED}:ord_1:${FIRST.toISOString()}`,
        {
          orderId: "ord_1",
          rank: 1,
          reference: "ORD-0001",
          reportedAt: FIRST.toISOString(),
          reportedBy: "s2",
          lines: [{ sku: "CRO", due: 4, packed: 3 }],
        },
      ],
    ]);
  });

  it("un second signalement publie un fait NEUF, que la boîte d'envoi n'absorbe pas", async () => {
    const { report, durable, clock } = setup(sheet(3));
    await report.execute(new ReportPackingShortfallCommand(DAY, "ord_1", "s2"));
    clock.set(LATER);

    await report.execute(new ReportPackingShortfallCommand(DAY, "ord_1", "s2"));

    expect(durable.of(REPORTED).map((fact) => fact.payload["reportedAt"])).toEqual([
      FIRST.toISOString(),
      LATER.toISOString(),
    ]);
  });

  it("refuse un bac complet et ne publie rien", async () => {
    const { report, durable, sheets } = setup(sheet(4));

    await expect(
      report.execute(new ReportPackingShortfallCommand(DAY, "ord_1", "s2")),
    ).rejects.toThrow(NothingShortError);
    expect(durable.facts).toEqual([]);
    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt ?? null).toBeNull();
  });

  it("refuse une commande pas encore arrivée au colisage", async () => {
    const { report } = setup(sheet(3));

    await expect(
      report.execute(new ReportPackingShortfallCommand(DAY, "ord_inconnue", "s2")),
    ).rejects.toThrow(PackingOrderNotDrawnYetError);
  });
});

describe("ClosePackingOrderHandler — la fermeture complète efface le manque", () => {
  it("publie packing.shortfall_cleared quand un manque était signalé", async () => {
    const { close, sheets, durable, clock } = setup(sheet(4, { shortfallReportedAt: FIRST }));
    clock.set(LATER);

    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s2"));

    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt).toBeNull();
    expect(durable.of(CLEARED).map((fact) => [fact.key, fact.payload])).toEqual([
      [
        `${CLEARED}:ord_1:${LATER.toISOString()}`,
        { orderId: "ord_1", rank: 1, reference: "ORD-0001", clearedAt: LATER.toISOString() },
      ],
    ]);
  });

  it("ne publie rien d'autre que « bac fait » sans manque signalé", async () => {
    const { close, durable } = setup(sheet(4));

    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s2"));

    expect(durable.of(CLEARED)).toEqual([]);
  });
});
