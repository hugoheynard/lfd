import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../../../../production/channels/packing/index.js";
import { LineNotProducedYetError } from "../../../domain/errors/packing-station-errors.js";
import {
  InMemoryResupplies,
  InMemoryResupplyBoard,
  InMemoryResupplyRepository,
} from "../../__tests__/resupply-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemoryDayStocks, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { OnResupplyLaunched } from "../../handlers/on-resupply-launched.handler.js";
import { ClosePackingResupplyCommand } from "../close-packing-resupply.command.js";
import { ClosePackingResupplyHandler } from "../close-packing-resupply.handler.js";
import { EnterPackedResupplyLineCommand } from "../enter-packed-resupply-line.command.js";
import { EnterPackedResupplyLineHandler } from "../enter-packed-resupply-line.handler.js";
import { ListPackingResuppliesHandler } from "../list-packing-resupplies.handler.js";
import { ListPackingResuppliesQuery } from "../list-packing-resupplies.query.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const DAY = "2026-10-22";
const EVENING = new Date("2026-10-21T18:00:00.000Z");
const LAUNCHED = new Date("2026-10-22T07:00:00.000Z");

async function setup(received: number) {
  const table = new InMemoryResupplies();
  await table.draw({
    serviceDay: DAY,
    resupplyId: "rs_evening",
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    kind: "evening",
    drawnAt: EVENING,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 2 }],
  });
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received, returned: 0 });
  const stocks = new InMemoryStocks(shadow);
  const repository = new InMemoryResupplyRepository(table);
  const clock = new FixedClock(LAUNCHED);
  const uow = new DirectUnitOfWork();
  const launch = () =>
    new OnResupplyLaunched(table, stocks, clock).handle({
      eventId: "evt_1",
      type: PRODUCTION_RESUPPLY_LAUNCHED,
      payload: new ResupplyLaunchedEvent(DAY, LAUNCHED, "staff_max", "Max", {
        resupplyId: "rs_asap",
        siteId: "site_village",
        siteLabel: "Le Village",
        name: "Rupture de midi",
        servedByTransfer: true,
        lines: [{ sku: "CRO", productName: "Croissant", quantity: 6 }],
      }).durableFact().payload,
    });
  return {
    shadow,
    stocks,
    launch,
    enter: new EnterPackedResupplyLineHandler(repository, stocks, clock, uow),
    close: new ClosePackingResupplyHandler(repository, stocks, clock, uow),
    list: new ListPackingResuppliesHandler(
      new InMemoryResupplyBoard(table),
      new InMemoryDayStocks(stocks),
    ),
  };
}

const enter = (resupplyId: string, quantity: number) =>
  new EnterPackedResupplyLineCommand(DAY, resupplyId, "CRO", quantity, "staff_lou");

/** Une commande met au bac, par l'agrégat — le geste de `AllocateToContainer`. */
async function orderTakes(stocks: InMemoryStocks, quantity: number): Promise<void> {
  const stock = await stocks.lock(DAY, "CRO");
  stock.take(quantity, "Croissant");
  await stocks.save(stock);
}

describe("la fiche « au plus tôt » au poste (R4b)", () => {
  it("emballe sur sa réservation pendant qu'une commande est refusée sur la même pièce", async () => {
    const { stocks, launch, enter: handler } = await setup(6);
    await launch();

    await expect(orderTakes(stocks, 1)).rejects.toThrow(LineNotProducedYetError);
    await handler.execute(enter("rs_asap", 6));

    expect(stocks.packedOf(DAY, "CRO")).toBe(6);
  });

  it("une commande au bac AVANT le lancement y reste : la fiche attend le four", async () => {
    const { stocks, launch, list } = await setup(10);
    await orderTakes(stocks, 8);

    await launch();

    expect(stocks.packedOf(DAY, "CRO")).toBe(8);
    const view = await list.execute(new ListPackingResuppliesQuery(DAY));
    expect(view.resupplies[0]).toMatchObject({
      resupplyId: "rs_asap",
      title: "Rupture de midi — Le Village · au plus tôt",
      kind: "asap",
      awaitingOven: true,
      lines: [{ sku: "CRO", requested: 6, packed: null, awaitingOven: 4 }],
    });
  });

  it("la fiche du soir ne prend pas les pièces réservées par le lancé", async () => {
    const { launch, enter: handler } = await setup(6);
    await launch();

    await expect(handler.execute(enter("rs_evening", 2))).rejects.toThrow(
      /Il manque 2 « Croissant »/,
    );
  });

  it("la clôture lève la réservation : ce qui n'est pas emballé redevient libre", async () => {
    const { stocks, launch, enter: handler, close } = await setup(6);
    await launch();
    await handler.execute(enter("rs_asap", 4));

    await close.execute(new ClosePackingResupplyCommand(DAY, "rs_asap", "staff_lou"));

    const stock = await stocks.lock(DAY, "CRO");
    expect(stock.reserved).toBe(0);
    expect(stock.free).toBe(2);
    expect(stock.reservations[0]?.releasedAt).toEqual(LAUNCHED);
  });

  it("met les fiches « au plus tôt » en tête de la liste", async () => {
    const { launch, list } = await setup(20);
    await launch();

    const view = await list.execute(new ListPackingResuppliesQuery(DAY));

    expect(view.resupplies.map((sheet) => [sheet.resupplyId, sheet.awaitingOven])).toEqual([
      ["rs_asap", false],
      ["rs_evening", false],
    ]);
  });
});
