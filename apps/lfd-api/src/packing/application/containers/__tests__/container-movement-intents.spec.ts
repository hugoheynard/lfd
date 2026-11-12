import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  InsideUnitOfWork,
  SealingIntentLedger,
} from "../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { IntentKeyReusedError } from "../../../../platform/intent/intent-errors.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { WithdrawBeyondContentError } from "../../../domain/errors/packing-container-errors.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { RecordingPlanHold } from "../../__tests__/arrested-plan-doubles.js";
import { InMemoryPackingSettings } from "../../__tests__/packing-settings-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { AllocateToContainerCommand } from "../allocate-to-container.command.js";
import { AllocateToContainerHandler } from "../allocate-to-container.handler.js";
import { MoveBetweenContainersCommand } from "../move-between-containers.command.js";
import { MoveBetweenContainersHandler } from "../move-between-containers.handler.js";
import { OpenPackingContainerCommand } from "../open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../open-packing-container.handler.js";
import { WithdrawFromContainerCommand } from "../withdraw-from-container.command.js";
import { WithdrawFromContainerHandler } from "../withdraw-from-container.handler.js";

/*
 * Glisser, retirer, déplacer sont des DELTAS : un double clic les referait.
 * Chacun est scellé par la clé d'intention de l'écran, dans l'unité de
 * travail du mouvement (décision de Hugo du 2026-11-12).
 */

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const STAFF = "staff_1";
const KEY = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";
const OTHER_KEY = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

/** Le registre qui refuse de sceller, posé par le test. */
class SealRefused extends TechnicalError {
  constructor() {
    super("test.seal_refused", "Scellement refusé par le test.");
  }
}

async function setup() {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 20, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 20, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
  const stocks = new InMemoryStocks(shadow);
  const desk = new ScriptedBinDesk();
  const events = new RecordingPublisher();
  const clock = new FixedClock(new Date(0));
  const uow = new InsideUnitOfWork();
  const ledger = new SealingIntentLedger(() => uow.inside);
  const intents = new OncePerIntent(ledger, clock);
  const open = new OpenPackingContainerHandler(
    sheets,
    desk,
    new FixedIdGenerator("ctn"),
    clock,
    events,
    uow,
    InMemoryPackingSettings.sharingOpen().reader(),
    new RecordingPlanHold(),
  );
  const from = await open.execute(
    new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF),
  );
  const to = await open.execute(
    new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF),
  );
  return {
    sheets,
    stocks,
    events,
    ledger,
    from,
    to,
    allocate: new AllocateToContainerHandler(
      sheets,
      stocks,
      desk,
      clock,
      events,
      uow,
      new RecordingPlanHold(),
      intents,
    ),
    withdraw: new WithdrawFromContainerHandler(sheets, stocks, events, uow, intents),
    move: new MoveBetweenContainersHandler(sheets, desk, events, uow, intents),
    piecesOf: () => sheets.of(DAY, "ord_1")?.containerList.map((c) => c.lines[0]?.quantity ?? 0),
  };
}

describe("Glisser — une fois par intention", () => {
  it("rejouée avec la même clé, ne glisse qu'une fois et rend le même résultat", async () => {
    const world = await setup();
    const command = new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 6, STAFF, KEY);

    const first = await world.allocate.execute(command);
    const replay = await world.allocate.execute(command);

    expect(replay).toEqual(first);
    expect(world.stocks.packedOf(DAY, "CRO")).toBe(6);
    expect(world.events.factTypes().filter((t) => t === "packing_container.filled")).toHaveLength(
      1,
    );
    expect(world.ledger.resolutions).toEqual(["in tx"]);
  });

  it("une clé neuve est un second geste voulu : il glisse à nouveau", async () => {
    const world = await setup();

    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 6, STAFF, KEY),
    );
    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 6, STAFF, OTHER_KEY),
    );

    expect(world.stocks.packedOf(DAY, "CRO")).toBe(12);
  });

  it("la même clé sur une autre ligne de contenant est refusée (409 nommé)", async () => {
    const world = await setup();
    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 6, STAFF, KEY),
    );

    await expect(
      world.allocate.execute(
        new AllocateToContainerCommand(DAY, "ord_1", world.to, "CRO", 6, STAFF, KEY),
      ),
    ).rejects.toThrow(IntentKeyReusedError);
    expect(world.stocks.packedOf(DAY, "CRO")).toBe(6);
  });
});

describe("Retirer — une fois par intention", () => {
  it("rejouée avec la même clé, ne ressort les pièces qu'une fois", async () => {
    const world = await setup();
    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 10, STAFF, KEY),
    );
    const command = new WithdrawFromContainerCommand(
      DAY,
      "ord_1",
      world.from,
      "CRO",
      4,
      STAFF,
      OTHER_KEY,
    );

    await world.withdraw.execute(command);
    await world.withdraw.execute(command);

    expect(world.stocks.packedOf(DAY, "CRO")).toBe(6);
    expect(world.ledger.resolutions).toEqual(["in tx", "in tx"]);
  });

  it("un échec rend l'intention : la même clé réessaie et réexécute", async () => {
    const world = await setup();
    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 3, STAFF, KEY),
    );
    const beyond = new WithdrawFromContainerCommand(
      DAY,
      "ord_1",
      world.from,
      "CRO",
      4,
      STAFF,
      OTHER_KEY,
    );

    await expect(world.withdraw.execute(beyond)).rejects.toThrow(WithdrawBeyondContentError);
    await world.allocate.execute(
      new AllocateToContainerCommand(
        DAY,
        "ord_1",
        world.from,
        "CRO",
        1,
        STAFF,
        "9e8d7c6b-5a49-4382-a716-151413121110",
      ),
    );
    await world.withdraw.execute(beyond);

    expect(world.stocks.packedOf(DAY, "CRO")).toBe(0);
  });
});

describe("Déplacer — une fois par intention", () => {
  it("rejouée avec la même clé, ne déplace qu'une fois", async () => {
    const world = await setup();
    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 10, STAFF, KEY),
    );
    const command = new MoveBetweenContainersCommand(
      DAY,
      "ord_1",
      world.from,
      world.to,
      "CRO",
      4,
      STAFF,
      OTHER_KEY,
    );

    await world.move.execute(command);
    await world.move.execute(command);

    expect(world.piecesOf()).toEqual([6, 4]);
    expect(world.stocks.packedOf(DAY, "CRO")).toBe(10);
  });

  it("un scellement refusé fait échouer le geste et rend l'intention", async () => {
    const world = await setup();
    await world.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", world.from, "CRO", 10, STAFF, KEY),
    );
    world.ledger.refuseNextSeal = new SealRefused();
    const command = new MoveBetweenContainersCommand(
      DAY,
      "ord_1",
      world.from,
      world.to,
      "CRO",
      4,
      STAFF,
      OTHER_KEY,
    );

    await expect(world.move.execute(command)).rejects.toBeInstanceOf(SealRefused);
    // Les doubles en mémoire ne jouent pas l'annulation (cf. SealingIntentLedger) :
    // seul compte ici que l'intention soit rendue, et le rejeu réexécuté.
    await world.move.execute(command);
    expect(world.ledger.resolutions).toEqual(["in tx", "in tx", "in tx"]);
  });
});
