import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ContainerBinGoneError,
  WithdrawBeyondContentError,
} from "../../../domain/errors/packing-container-errors.js";
import { PackingOrderNotDrawnYetError } from "../../../domain/errors/packing-station-errors.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { AllocateToContainerCommand } from "../allocate-to-container.command.js";
import { AllocateToContainerHandler } from "../allocate-to-container.handler.js";
import { MoveBetweenContainersCommand } from "../move-between-containers.command.js";
import { MoveBetweenContainersHandler } from "../move-between-containers.handler.js";
import { OpenPackingContainerCommand } from "../open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../open-packing-container.handler.js";

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const STAFF = "staff_1";
const BAG = { nature: "bag" } as const;
const BIN = { nature: "bin", binTypeId: "t_m", half: false, innerBags: 0 } as const;

async function setup(target: typeof BAG | typeof BIN = BAG) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 20, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 20, packed: null }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
  const stocks = new InMemoryStocks(shadow);
  const desk = new ScriptedBinDesk();
  const events = new RecordingPublisher();
  const clock = new FixedClock(new Date(0));
  const uow = new DirectUnitOfWork();
  const open = new OpenPackingContainerHandler(
    sheets,
    desk,
    new FixedIdGenerator("ctn"),
    clock,
    events,
    uow,
  );
  const from = await open.execute(new OpenPackingContainerCommand(DAY, "ord_1", BAG, STAFF));
  const to = await open.execute(new OpenPackingContainerCommand(DAY, "ord_1", target, STAFF));
  await new AllocateToContainerHandler(sheets, stocks, desk, clock, events, uow).execute(
    new AllocateToContainerCommand(DAY, "ord_1", from, "CRO", 18, STAFF),
  );
  events.traced.length = 0;
  const move = new MoveBetweenContainersHandler(sheets, desk, events, uow);
  return { sheets, stocks, desk, events, move, from, to };
}

describe("MoveBetweenContainersHandler — un geste, la réserve immobile", () => {
  it("déplace les pièces, laisse la réserve, et journalise vidé puis rempli", async () => {
    const { move, sheets, stocks, events, from, to } = await setup();

    await move.execute(new MoveBetweenContainersCommand(DAY, "ord_1", from, to, "CRO", 18));

    expect(sheets.of(DAY, "ord_1")?.containerList.map((c) => c.lines)).toEqual([
      [{ sku: "CRO", quantity: 0 }],
      [{ sku: "CRO", quantity: 18 }],
    ]);
    expect(stocks.packedOf(DAY, "CRO")).toBe(18);
    expect(events.factTypes()).toEqual(["packing_container.emptied", "packing_container.filled"]);
  });

  it("refuse au-delà du contenu, sans rien écrire ni publier", async () => {
    const { move, sheets, events, from, to } = await setup();

    await expect(
      move.execute(new MoveBetweenContainersCommand(DAY, "ord_1", from, to, "CRO", 19)),
    ).rejects.toThrow(WithdrawBeyondContentError);
    expect(sheets.of(DAY, "ord_1")?.containerList[0]?.lines).toEqual([
      { sku: "CRO", quantity: 18 },
    ]);
    expect(events.traced).toEqual([]);
  });

  it("refuse un bac d'arrivée que la livraison ne connaît plus vivant", async () => {
    const { move, desk, from, to } = await setup(BIN);
    desk.dead.add("bin_1");

    await expect(
      move.execute(new MoveBetweenContainersCommand(DAY, "ord_1", from, to, "CRO", 1)),
    ).rejects.toThrow(ContainerBinGoneError);
  });

  it("refuse une commande dont la liste n'est pas arrivée", async () => {
    const { move, from, to } = await setup();

    await expect(
      move.execute(new MoveBetweenContainersCommand(DAY, "ord_x", from, to, "CRO", 1)),
    ).rejects.toThrow(PackingOrderNotDrawnYetError);
  });
});
