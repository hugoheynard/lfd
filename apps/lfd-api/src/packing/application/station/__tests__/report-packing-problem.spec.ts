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
  PackingSheetHandedOverError,
  ProblemAfterDecisionError,
  ProblemOutsideSimplePickupError,
} from "../../../domain/errors/packing-problem-errors.js";
import { NothingShortError } from "../../../domain/errors/packing-shortfall-errors.js";
import { RecordingPlanHold } from "../../__tests__/arrested-plan-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import {
  InMemorySheets,
  InMemoryStocks,
  RecordingDurable,
} from "../../__tests__/station-doubles.js";
import { ReportPackingProblemCommand } from "../report-packing-problem.command.js";
import { ReportPackingProblemHandler } from "../report-packing-problem.handler.js";

// Un jour et des instants comparés entre eux, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(1_000);
const REPORTED = "packing.shortfall_reported";

let intentCount = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
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
      { sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" },
      { sku: "PAC", productName: "Pain au chocolat", quantity: 2, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    trackingLevel: "simple",
    ...overrides,
  };
}

/** Le même retrait fermé par « Tout est prêt » : tout au sac. */
function sealed(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  const mark = { at: new Date(0), by: "s1" };
  return sheet({
    packed: mark,
    lines: sheet().lines.map((line) => ({ ...line, packed: { ...mark, initials: "" } })),
    containerList: [
      {
        id: "bag_0",
        nature: "bag",
        bin: null,
        opened: mark,
        voided: null,
        lines: [
          { sku: "CRO", quantity: 4 },
          { sku: "PAC", quantity: 2 },
        ],
      },
    ],
    ...overrides,
  });
}

function setup(snapshot: PackingSheetSnapshot, packed = { CRO: 0, PAC: 0 }) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 10, returned: 0 });
  shadow.stocks.set(`${DAY}/PAC`, { received: 2, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put(snapshot);
  const stocks = new InMemoryStocks(shadow);
  const durable = new RecordingDurable();
  const events = new RecordingPublisher();
  const clock = new FixedClock(AT);
  const uow = new InsideUnitOfWork();
  const intents = new OncePerIntent(new SealingIntentLedger(() => uow.inside), clock);
  const handler = new ReportPackingProblemHandler(
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
  return { sheets, stocks, durable, events, handler, packed };
}

async function preload(stocks: InMemoryStocks, sku: string, quantity: number): Promise<void> {
  const stock = await stocks.lock(DAY, sku);
  stock.take(quantity, sku, "piece");
  await stocks.save(stock);
}

function problem(present: { sku: string; present: number }[], key = nextKey()) {
  return new ReportPackingProblemCommand(DAY, "ord_1", present, "staff_2", key);
}

describe("ReportPackingProblemHandler — « Problème » au niveau simple", () => {
  it("sur une fiche ouverte : ouvre un sac, y met ce qui est là, met l'absent de côté, déclare le manque", async () => {
    const { handler, sheets, stocks, durable, events } = setup(sheet());

    await handler.execute(problem([{ sku: "CRO", present: 1 }]));

    const after = sheets.of(DAY, "ord_1");
    expect(after?.shortfallReportedAt).toEqual(AT);
    expect(after?.containerList).toEqual([
      expect.objectContaining({
        nature: "bag",
        lines: [
          { sku: "CRO", quantity: 1 },
          { sku: "PAC", quantity: 2 },
        ],
      }),
    ]);
    expect(stocks.packedOf(DAY, "CRO")).toBe(1);
    expect(stocks.missingOf(DAY, "CRO")).toBe(3);
    expect(stocks.missingOf(DAY, "PAC")).toBe(0);
    expect(durable.of(REPORTED).map((fact) => fact.payload["lines"])).toEqual([
      [
        { sku: "CRO", due: 4, packed: 1 },
        { sku: "PAC", due: 2, packed: 2 },
      ],
    ]);
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "packing_container.opened",
      "packing_container.filled",
      "packing_container.filled",
    ]);
  });

  it("sur une fiche fermée : rouvre le sac, en sort l'absent et le met de côté", async () => {
    const { handler, sheets, stocks } = setup(sealed());
    await preload(stocks, "CRO", 4);
    await preload(stocks, "PAC", 2);

    await handler.execute(problem([{ sku: "CRO", present: 3 }]));

    const after = sheets.of(DAY, "ord_1");
    expect(after?.packed).toBeNull();
    expect(after?.containerList[0]?.lines).toEqual([
      { sku: "CRO", quantity: 3 },
      { sku: "PAC", quantity: 2 },
    ]);
    expect(stocks.packedOf(DAY, "CRO")).toBe(3);
    expect(stocks.missingOf(DAY, "CRO")).toBe(1);
    expect((await stocks.lock(DAY, "CRO")).free).toBe(6);
  });

  it("borne le sac par la réserve : on ne met pas au sac ce que le four n'a pas remis", async () => {
    const { handler, sheets, stocks } = setup(sheet());
    const pac = await stocks.lock(DAY, "PAC");
    pac.setAside(1, "Pain au chocolat", "piece");
    await stocks.save(pac);

    await handler.execute(problem([{ sku: "CRO", present: 4 }]));

    expect(sheets.of(DAY, "ord_1")?.containerList[0]?.lines).toEqual([
      { sku: "CRO", quantity: 4 },
      { sku: "PAC", quantity: 1 },
    ]);
    expect(stocks.missingOf(DAY, "PAC")).toBe(1);
  });

  it("refuse une commande retirée par le client, sans rien écrire", async () => {
    const { handler, stocks, durable } = setup(sealed({ handedOverAt: AT }));

    await expect(handler.execute(problem([{ sku: "CRO", present: 3 }]))).rejects.toThrow(
      PackingSheetHandedOverError,
    );
    expect(stocks.missingOf(DAY, "CRO")).toBe(0);
    expect(durable.facts).toEqual([]);
  });

  it.each([
    ["une livraison", { fulfillmentMethod: "delivery" as const }],
    ["un retrait détaillé", { trackingLevel: "detailed" as const }],
  ])("refuse %s", async (_label, overrides) => {
    const { handler } = setup(sheet(overrides));

    await expect(handler.execute(problem([{ sku: "CRO", present: 1 }]))).rejects.toThrow(
      ProblemOutsideSimplePickupError,
    );
  });

  it("refuse quand le départ incomplet est déjà décidé", async () => {
    const { handler } = setup(sealed({ shortfallAuthorizedAt: AT }));

    await expect(handler.execute(problem([{ sku: "CRO", present: 1 }]))).rejects.toThrow(
      ProblemAfterDecisionError,
    );
  });

  it("refuse quand tout est déclaré présent", async () => {
    const { handler, durable } = setup(sheet());

    await expect(handler.execute(problem([]))).rejects.toThrow(NothingShortError);
    expect(durable.facts).toEqual([]);
  });

  it("un double clic (même clé) ne signale et ne met de côté qu'une fois", async () => {
    const { handler, stocks, durable } = setup(sealed());
    await preload(stocks, "CRO", 4);
    await preload(stocks, "PAC", 2);
    const key = nextKey();

    await handler.execute(problem([{ sku: "CRO", present: 2 }], key));
    await handler.execute(problem([{ sku: "CRO", present: 2 }], key));

    expect(stocks.missingOf(DAY, "CRO")).toBe(2);
    expect(durable.of(REPORTED)).toHaveLength(1);
  });
});
