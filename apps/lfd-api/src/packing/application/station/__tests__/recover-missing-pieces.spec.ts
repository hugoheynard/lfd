import {
  InsideUnitOfWork,
  SealingIntentLedger,
} from "../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecoveredBeyondMissingError } from "../../../domain/errors/packing-problem-errors.js";
import { PackingLineNotFoundError } from "../../../domain/errors/packing-station-errors.js";
import { RecordingPlanHold } from "../../__tests__/arrested-plan-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { RecoverMissingPiecesCommand } from "../recover-missing-pieces.command.js";
import { RecoverMissingPiecesHandler } from "../recover-missing-pieces.handler.js";

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";

let intentCount = 0;
const nextKey = (): string => `intent_${String((intentCount += 1))}`;

async function setup() {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 10, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    trackingLevel: "simple",
  });
  const stocks = new InMemoryStocks(shadow);
  const stock = await stocks.lock(DAY, "CRO");
  stock.setAside(3, "Croissant", "piece");
  await stocks.save(stock);
  const clock = new FixedClock(new Date(0));
  const uow = new InsideUnitOfWork();
  const intents = new OncePerIntent(new SealingIntentLedger(() => uow.inside), clock);
  const handler = new RecoverMissingPiecesHandler(
    sheets,
    stocks,
    uow,
    new RecordingPlanHold(),
    intents,
  );
  return { stocks, handler };
}

function found(quantity: number, sku = "CRO", key = nextKey()) {
  return new RecoverMissingPiecesCommand(DAY, "ord_1", [{ sku, quantity }], "manager_1", key);
}

describe("RecoverMissingPiecesHandler — « Pièces retrouvées »", () => {
  it("rend les pièces au libre de la réserve", async () => {
    const { handler, stocks } = await setup();

    await handler.execute(found(2));

    expect(stocks.missingOf(DAY, "CRO")).toBe(1);
    expect((await stocks.lock(DAY, "CRO")).free).toBe(9);
  });

  it("refuse plus que ce qui a été mis de côté, sans rien rendre", async () => {
    const { handler, stocks } = await setup();

    await expect(handler.execute(found(4))).rejects.toThrow(RecoveredBeyondMissingError);
    expect(stocks.missingOf(DAY, "CRO")).toBe(3);
  });

  it("refuse un article qui n'est pas sur la commande", async () => {
    const { handler } = await setup();

    await expect(handler.execute(found(1, "PAC"))).rejects.toThrow(PackingLineNotFoundError);
  });

  it("un double clic (même clé) ne rend qu'une fois", async () => {
    const { handler, stocks } = await setup();
    const key = nextKey();

    await handler.execute(found(1, "CRO", key));
    await handler.execute(found(1, "CRO", key));

    expect(stocks.missingOf(DAY, "CRO")).toBe(2);
  });
});
