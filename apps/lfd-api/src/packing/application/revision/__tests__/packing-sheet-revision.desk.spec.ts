import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import { RevisedDueBelowPackedError } from "../../../domain/errors/packing-revision-errors.js";
import { PackingSheetWithdrawnError } from "../../../domain/errors/packing-withdrawal-errors.js";
import { InMemorySheets } from "../../__tests__/station-doubles.js";
import { PackingSheetRevisionDesk } from "../packing-sheet-revision.desk.js";

/**
 * Le guichet de la révision au colisage (plan A2, § 2.2 et § 7). Un jour et
 * un instant recopiés, jamais comparés à l'horloge.
 */

const DAY = "2030-03-12";
const NOW = new Date(0);
const STAFF = "staff_1";
const MARK = { at: NOW, by: "staff_pack" };

function sheetRow(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 1,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 6, packed: null }],
    containerMode: "listed",
    containerList: [
      {
        id: "c1",
        nature: "bag",
        bin: null,
        opened: MARK,
        voided: null,
        lines: [{ sku: "CRO", quantity: 4 }],
      },
    ],
    fulfillmentMethod: "pickup",
    ...overrides,
  };
}

function setup(row: PackingSheetSnapshot | null = sheetRow()) {
  const sheets = new InMemorySheets();
  if (row !== null) {
    sheets.put(row);
  }
  const events = new RecordingPublisher();
  const desk = new PackingSheetRevisionDesk(
    sheets,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    events,
  );
  return { desk, sheets, events };
}

describe("PackingSheetRevisionDesk", () => {
  it("une hausse : la ligne due monte, la feuille est écrite, le fait est journalisé", async () => {
    const { desk, sheets, events } = setup();

    const outcome = await desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 9 }], STAFF);

    expect(outcome).toBe("revised");
    expect(sheets.of(DAY, "ord_1")?.lines[0]?.quantity).toBe(9);
    expect(events.factTypes()).toEqual(["packing_sheet.revised"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "ORD-0001",
      serviceDay: DAY,
      lines: [{ sku: "CRO", productName: "Croissant", from: 6, to: 9 }],
    });
  });

  it("la même composition : « revised », rien d'écrit, rien de publié", async () => {
    const { desk, events } = setup();

    expect(await desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 6 }], STAFF)).toBe("revised");
    expect(events.factTypes()).toEqual([]);
  });

  it("la feuille n'est pas encore arrivée : « sheet_missing », rien d'écrit", async () => {
    const { desk, sheets } = setup(null);

    expect(await desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 9 }], STAFF)).toBe(
      "sheet_missing",
    );
    expect(sheets.rows.size).toBe(0);
  });

  it("un bac fermé : « packed », rien d'écrit", async () => {
    const { desk, sheets } = setup(sheetRow({ packed: MARK }));

    expect(await desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 9 }], STAFF)).toBe("packed");
    expect(sheets.of(DAY, "ord_1")?.lines[0]?.quantity).toBe(6);
  });

  it("un contenant porte un bac de livraison vivant : « delivery_bin », rien d'écrit", async () => {
    const row = sheetRow({ fulfillmentMethod: "delivery" });
    const withBin = {
      ...row,
      containerList: row.containerList.map((container) => ({
        ...container,
        nature: "bin" as const,
        bin: { binId: "bin_1", code: "A1", half: null },
      })),
    };
    const { desk, sheets } = setup(withBin);

    expect(await desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 9 }], STAFF)).toBe(
      "delivery_bin",
    );
    expect(sheets.of(DAY, "ord_1")?.lines[0]?.quantity).toBe(6);
  });

  it("une baisse sous ce qui est au bac : refusée, rien d'écrit", async () => {
    const { desk, sheets } = setup();

    await expect(desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 3 }], STAFF)).rejects.toThrow(
      RevisedDueBelowPackedError,
    );
    expect(sheets.of(DAY, "ord_1")?.lines[0]?.quantity).toBe(6);
  });

  it("une feuille retirée (A1) ne se révise pas", async () => {
    const { desk } = setup(sheetRow({ withdrawnAt: NOW, containerList: [] }));

    await expect(desk.revise(DAY, "ord_1", [{ sku: "CRO", quantity: 9 }], STAFF)).rejects.toThrow(
      PackingSheetWithdrawnError,
    );
  });
});
