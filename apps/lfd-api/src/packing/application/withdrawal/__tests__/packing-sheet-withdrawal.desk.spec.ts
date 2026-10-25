import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InscribedOrderHeaderReader,
  type InscribedOrderHeader,
} from "../../../../production/channels/packing/index.js";
import type { PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import { InscribedOrderNotOnDayError } from "../../../domain/errors/packing-withdrawal-errors.js";
import {
  PackingSheetTombstones,
  type PackingSheetTombstone,
} from "../../../domain/ports/packing-sheet-tombstones.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { AllocateToContainerCommand } from "../../containers/allocate-to-container.command.js";
import { AllocateToContainerHandler } from "../../containers/allocate-to-container.handler.js";
import { OpenPackingContainerCommand } from "../../containers/open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../../containers/open-packing-container.handler.js";
import { PackingContainerVoiding } from "../../containers/packing-container-voiding.js";
import { PackingSheetWithdrawalDesk } from "../packing-sheet-withdrawal.desk.js";

/**
 * Le guichet du retrait au colisage (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.2). Un jour et un instant recopiés, jamais comparés à l'horloge.
 */

const DAY = "2030-03-12";
const NOW = new Date(0);
const STAFF = "staff_1";
const HEADER: InscribedOrderHeader = {
  reference: "ORD-0001",
  customerLabel: "Camille",
  fulfillmentMethod: "pickup",
  dueAt: "09:00",
  clientele: "public",
  siteId: null,
};

/** Les en-têtes du plan, donnés d'avance. */
class FixedHeaders extends InscribedOrderHeaderReader {
  constructor(private readonly known: ReadonlyMap<string, InscribedOrderHeader>) {
    super();
  }

  headerOf(_serviceDay: string, orderId: string): Promise<InscribedOrderHeader | null> {
    return Promise.resolve(this.known.get(orderId) ?? null);
  }
}

/** La pierre tombale, écrite dans la même mémoire que les feuilles — `ON CONFLICT DO NOTHING`. */
class InMemoryTombstones extends PackingSheetTombstones {
  readonly laid: PackingSheetTombstone[] = [];

  constructor(private readonly sheets: InMemorySheets) {
    super();
  }

  lay(tombstone: PackingSheetTombstone): Promise<void> {
    this.laid.push(tombstone);
    if (this.sheets.of(tombstone.serviceDay, tombstone.orderId) === undefined) {
      this.sheets.put({
        serviceDay: tombstone.serviceDay,
        orderId: tombstone.orderId,
        reference: tombstone.reference,
        packed: null,
        containers: 0,
        lines: [],
        containerMode: "listed",
        containerList: [],
        fulfillmentMethod: tombstone.fulfillmentMethod,
        withdrawnAt: tombstone.withdrawnAt,
      });
    }
    return Promise.resolve();
  }
}

function sheetRow(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 6, packed: null }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    ...overrides,
  };
}

function setup() {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 20, returned: 0 });
  const sheets = new InMemorySheets();
  const stocks = new InMemoryStocks(shadow);
  const binDesk = new ScriptedBinDesk();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const tombstones = new InMemoryTombstones(sheets);
  const desk = new PackingSheetWithdrawalDesk(
    sheets,
    tombstones,
    new FixedHeaders(new Map([["ord_1", HEADER]])),
    new PackingContainerVoiding(stocks, binDesk, events),
    clock,
    uow,
  );
  const open = new OpenPackingContainerHandler(
    sheets,
    binDesk,
    new FixedIdGenerator("ctn"),
    clock,
    events,
    uow,
  );
  const allocate = new AllocateToContainerHandler(sheets, stocks, binDesk, clock, events, uow);
  return { desk, sheets, stocks, binDesk, events, tombstones, open, allocate };
}

describe("PackingSheetWithdrawalDesk", () => {
  it("une feuille entamée : chaque sac annulé, la réserve rendue, la feuille retirée", async () => {
    const context = setup();
    context.sheets.put(sheetRow());
    const first = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF),
    );
    const second = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF),
    );
    await context.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", first, "CRO", 4, STAFF),
    );
    await context.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", second, "CRO", 2, STAFF),
    );
    expect(context.stocks.packedOf(DAY, "CRO")).toBe(6);

    const outcome = await context.desk.withdraw(DAY, "ord_1", "staff_cancel");

    expect(outcome).toBe("withdrawn");
    // `release`, jamais `giveBack` : le reçu et le rendu au fournil n'ont pas bougé.
    expect(context.stocks.packedOf(DAY, "CRO")).toBe(0);
    expect(context.sheets.of(DAY, "ord_1")?.withdrawnAt).toBe(NOW);
    expect(
      context.sheets.of(DAY, "ord_1")?.containerList.map((container) => container.voided),
    ).toEqual([
      { at: NOW, by: "staff_cancel" },
      { at: NOW, by: "staff_cancel" },
    ]);
    expect(context.tombstones.laid).toEqual([]);
  });

  it("pas encore de feuille : la pierre tombale, avec l'en-tête figé par le fournil", async () => {
    const context = setup();

    const outcome = await context.desk.withdraw(DAY, "ord_1", "staff_cancel");

    expect(outcome).toBe("withdrawn");
    expect(context.tombstones.laid).toEqual([
      { serviceDay: DAY, orderId: "ord_1", ...HEADER, withdrawnAt: NOW },
    ]);
    expect(context.sheets.of(DAY, "ord_1")?.withdrawnAt).toBe(NOW);
  });

  it("une feuille fermée : `packed`, et rien n'est écrit", async () => {
    const context = setup();
    context.sheets.put(sheetRow({ packed: { at: NOW, by: STAFF } }));

    await expect(context.desk.withdraw(DAY, "ord_1", "staff_cancel")).resolves.toBe("packed");
    expect(context.sheets.of(DAY, "ord_1")?.withdrawnAt).toBeUndefined();
  });

  it("un bac de livraison vivant : `delivery_bin`, et on ne le défait pas", async () => {
    const context = setup();
    context.sheets.put(
      sheetRow({
        containerList: [
          {
            id: "c1",
            nature: "bin",
            bin: { binId: "bin_1", code: "ABC234", half: null },
            opened: { at: NOW, by: STAFF },
            voided: null,
            lines: [],
          },
        ],
      }),
    );

    await expect(context.desk.withdraw(DAY, "ord_1", "staff_cancel")).resolves.toBe("delivery_bin");
    expect(context.binDesk.voided).toEqual([]);
    expect(context.sheets.of(DAY, "ord_1")?.withdrawnAt).toBeUndefined();
  });

  it("un second retrait n'écrit rien de plus", async () => {
    const context = setup();
    await context.desk.withdraw(DAY, "ord_1", "staff_cancel");

    await expect(context.desk.withdraw(DAY, "ord_1", "staff_cancel")).resolves.toBe("withdrawn");
    expect(context.tombstones.laid).toHaveLength(1);
  });

  it("inscrite ailleurs qu'à ce jour : refus, plutôt qu'un retrait à moitié", async () => {
    const context = setup();

    await expect(context.desk.withdraw(DAY, "ord_autre", "staff_cancel")).rejects.toThrow(
      InscribedOrderNotOnDayError,
    );
  });
});
