import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  InsideUnitOfWork,
  SealingIntentLedger,
} from "../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import {
  AllReadyNotArrivedError,
  AllReadyOutsideSimplePickupError,
} from "../../../domain/errors/packing-all-ready-errors.js";
import { ShortfallAwaitingDecisionError } from "../../../domain/errors/packing-shortfall-errors.js";
import { RecordingPlanHold } from "../../__tests__/arrested-plan-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import {
  InMemorySheets,
  InMemoryStocks,
  RecordingDurable,
} from "../../__tests__/station-doubles.js";
import { DeclareAllReadyCommand } from "../declare-all-ready.command.js";
import { DeclareAllReadyHandler } from "../declare-all-ready.handler.js";

// Un jour et des instants comparés entre eux, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(1_000);
const PACKED = "packing.order_packed";
const CLEARED = "packing.shortfall_cleared";

let intentCount = 0;
const nextKey = (): string => `intent_${String((intentCount += 1))}`;

/** Un retrait au niveau simple : 4 croissants, 2 pains au chocolat. */
function sheet(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "PAC", productName: "Pain au chocolat", quantity: 2, packed: null, saleUnit: "piece" },
      { sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    trackingLevel: "simple",
    ...overrides,
  };
}

function setup(snapshot: PackingSheetSnapshot, received = { CRO: 10, PAC: 2 }) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: received.CRO, returned: 0 });
  shadow.stocks.set(`${DAY}/PAC`, { received: received.PAC, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put(snapshot);
  const stocks = new InMemoryStocks(shadow);
  const durable = new RecordingDurable();
  const events = new RecordingPublisher();
  const clock = new FixedClock(AT);
  const uow = new InsideUnitOfWork();
  const intents = new OncePerIntent(new SealingIntentLedger(() => uow.inside), clock);
  const handler = new DeclareAllReadyHandler(
    sheets,
    stocks,
    new FixedIdGenerator("bag"),
    clock,
    events,
    durable,
    uow,
    new RecordingPlanHold(),
    intents,
  );
  return { sheets, stocks, durable, events, handler };
}

function allReady(key = nextKey()): DeclareAllReadyCommand {
  return new DeclareAllReadyCommand(DAY, "ord_1", "staff_2", key);
}

describe("DeclareAllReadyHandler — « Tout est prêt » au niveau simple", () => {
  it("ouvre un sac, y met chaque ligne entière, ferme et publie `order_packed`", async () => {
    const { handler, sheets, stocks, durable, events } = setup(sheet());

    await handler.execute(allReady());

    const after = sheets.of(DAY, "ord_1");
    expect(after?.packed).toEqual({ at: AT, by: "staff_2" });
    expect(after?.containerList).toEqual([
      expect.objectContaining({
        nature: "bag",
        bin: null,
        lines: [
          { sku: "CRO", quantity: 4 },
          { sku: "PAC", quantity: 2 },
        ],
      }),
    ]);
    expect(stocks.packedOf(DAY, "CRO")).toBe(4);
    expect(stocks.packedOf(DAY, "PAC")).toBe(2);
    expect(durable.of(PACKED)).toHaveLength(1);
    expect(durable.of(CLEARED)).toEqual([]);
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "packing_container.opened",
      "packing_container.filled",
      "packing_container.filled",
    ]);
  });

  it("complète le sac déjà commencé sans en ouvrir un second", async () => {
    const mark = { at: new Date(0), by: "s1" };
    const { handler, sheets, stocks } = setup(
      sheet({
        containerList: [
          {
            id: "bag_0",
            nature: "bag",
            bin: null,
            opened: mark,
            voided: null,
            lines: [{ sku: "CRO", quantity: 3 }],
          },
        ],
      }),
    );
    const cro = await stocks.lock(DAY, "CRO");
    cro.take(3, "Croissant", "piece");
    await stocks.save(cro);

    await handler.execute(allReady());

    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([
      expect.objectContaining({
        id: "bag_0",
        lines: [
          { sku: "CRO", quantity: 4 },
          { sku: "PAC", quantity: 2 },
        ],
      }),
    ]);
    expect(stocks.packedOf(DAY, "CRO")).toBe(4);
  });

  it("refuse quand la réserve ne couvre pas tout, nomme ce qui manque, et n'écrit rien", async () => {
    const { handler, sheets, stocks, durable } = setup(sheet(), { CRO: 1, PAC: 2 });

    const refusal = handler.execute(allReady());

    await expect(refusal).rejects.toThrow(AllReadyNotArrivedError);
    await expect(refusal).rejects.toThrow(/3 « Croissant »/);
    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([]);
    expect(stocks.packedOf(DAY, "PAC")).toBe(0);
    expect(durable.facts).toEqual([]);
  });

  it("le manquant mis de côté n'est pas libre pour « Tout est prêt »", async () => {
    const { handler, stocks } = setup(sheet(), { CRO: 4, PAC: 2 });
    const cro = await stocks.lock(DAY, "CRO");
    cro.setAside(1, "Croissant", "piece");
    await stocks.save(cro);

    await expect(handler.execute(allReady())).rejects.toThrow(AllReadyNotArrivedError);
  });

  it("refuse un manque signalé et pas encore décidé quand la réserve ne le couvre pas", async () => {
    const { handler, durable } = setup(sheet({ shortfallReportedAt: AT }), { CRO: 1, PAC: 2 });

    await expect(handler.execute(allReady())).rejects.toThrow(ShortfallAwaitingDecisionError);
    expect(durable.facts).toEqual([]);
  });

  it("ferme et efface le manque signalé quand les pièces sont là", async () => {
    const { handler, sheets, durable } = setup(sheet({ shortfallReportedAt: new Date(0) }));

    await handler.execute(allReady());

    expect(sheets.of(DAY, "ord_1")?.shortfallReportedAt).toBeNull();
    expect(durable.of(PACKED)).toHaveLength(1);
    expect(durable.of(CLEARED)).toHaveLength(1);
  });

  it("la même clé ne ferme qu'une fois ; une fiche déjà fermée se réannonce sans rien prendre", async () => {
    const { handler, stocks, durable } = setup(sheet());
    const key = nextKey();

    await handler.execute(allReady(key));
    await handler.execute(allReady(key));
    expect(durable.of(PACKED)).toHaveLength(1);

    await handler.execute(allReady());
    expect(stocks.packedOf(DAY, "CRO")).toBe(4);
    expect(durable.of(CLEARED)).toEqual([]);
  });

  it.each([
    ["une livraison", { fulfillmentMethod: "delivery" as const }],
    ["un retrait détaillé", { trackingLevel: "detailed" as const }],
  ])("refuse %s", async (_label, overrides) => {
    const { handler, durable } = setup(sheet(overrides));

    await expect(handler.execute(allReady())).rejects.toThrow(AllReadyOutsideSimplePickupError);
    expect(durable.facts).toEqual([]);
  });
});
