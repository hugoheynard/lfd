import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { LineNotProducedYetError } from "../../../domain/errors/packing-station-errors.js";
import {
  PackingResupplyIncompleteError,
  PackingResupplyNotDrawnError,
} from "../../../domain/errors/packing-resupply-errors.js";
import {
  InMemoryResupplies,
  InMemoryResupplyBoard,
  InMemoryResupplyRepository,
} from "../../__tests__/resupply-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemoryStocks } from "../../__tests__/station-doubles.js";
import { ClosePackingResupplyCommand } from "../close-packing-resupply.command.js";
import { ClosePackingResupplyHandler } from "../close-packing-resupply.handler.js";
import { EnterPackedResupplyLineCommand } from "../enter-packed-resupply-line.command.js";
import { EnterPackedResupplyLineHandler } from "../enter-packed-resupply-line.handler.js";
import { ListPackingResuppliesHandler } from "../list-packing-resupplies.handler.js";
import { ListPackingResuppliesQuery } from "../list-packing-resupplies.query.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const AT = new Date("2026-10-21T04:00:00.000Z");
const DAY = "2026-10-22";

async function setup(received = 24) {
  const table = new InMemoryResupplies();
  await table.draw({
    serviceDay: DAY,
    resupplyId: "rs_1",
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    drawnAt: AT,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 12 }],
  });
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received, returned: 0 });
  const stocks = new InMemoryStocks(shadow);
  const repository = new InMemoryResupplyRepository(table);
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  return {
    table,
    stocks,
    enter: new EnterPackedResupplyLineHandler(repository, stocks, clock, uow),
    close: new ClosePackingResupplyHandler(repository, clock, uow),
    list: new ListPackingResuppliesHandler(new InMemoryResupplyBoard(table)),
  };
}

const enter = (quantity: number) =>
  new EnterPackedResupplyLineCommand(DAY, "rs_1", "CRO", quantity, "staff_lou");

describe("la fiche de réassort au poste (R3b)", () => {
  it("la saisie prend les pièces dans la réserve, et les rend si elle baisse", async () => {
    const { enter: handler, stocks } = await setup();

    await handler.execute(enter(12));
    expect(stocks.packedOf(DAY, "CRO")).toBe(12);

    await handler.execute(enter(9));
    expect(stocks.packedOf(DAY, "CRO")).toBe(9);
  });

  it("refuse d'emballer ce que le four n'a pas encore remis, sans rien écrire", async () => {
    const { enter: handler, stocks, list } = await setup(5);

    await expect(handler.execute(enter(12))).rejects.toThrow(LineNotProducedYetError);

    expect(stocks.packedOf(DAY, "CRO")).toBe(0);
    const view = await list.execute(new ListPackingResuppliesQuery(DAY));
    expect(view.resupplies[0]?.lines[0]?.packed).toBeNull();
  });

  it("refuse une fiche absente du colisage (404)", async () => {
    const { enter: handler } = await setup();

    await expect(
      handler.execute(new EnterPackedResupplyLineCommand(DAY, "rs_labo", "CRO", 1, "staff_lou")),
    ).rejects.toThrow(PackingResupplyNotDrawnError);
  });

  it("se clôt une fois tout saisi, et la liste la montre close vers le transfert du point", async () => {
    const { enter: handler, close, list } = await setup();
    await expect(
      close.execute(new ClosePackingResupplyCommand(DAY, "rs_1", "staff_lou")),
    ).rejects.toThrow(PackingResupplyIncompleteError);

    await handler.execute(enter(11));
    await close.execute(new ClosePackingResupplyCommand(DAY, "rs_1", "staff_lou"));

    expect(await list.execute(new ListPackingResuppliesQuery(DAY))).toEqual({
      date: DAY,
      resupplies: [
        {
          resupplyId: "rs_1",
          title: "Réassort Le Village",
          siteId: "site_village",
          destination: { kind: "transfer", siteId: "site_village" },
          status: "closed",
          closedAt: AT.toISOString(),
          lines: [{ sku: "CRO", productName: "Croissant", requested: 12, packed: 11 }],
        },
      ],
    });
  });
});
