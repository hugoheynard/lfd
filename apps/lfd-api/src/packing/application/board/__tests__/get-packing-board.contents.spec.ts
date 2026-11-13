import { addDays, instantToLocal } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { isPackingBoardContent, isStorablePackingBoard } from "../packing-board-content.js";
import { GetPackingBoardQuery } from "../get-packing-board.query.js";
import { boardAround, MemoryDayContents, order } from "./packing-board-doubles.js";

/**
 * Le poste servi depuis l'objet des journées (`le-cache-du-back-office.md`,
 * § 3.1), clé `packing`. Les jours sont dérivés de maintenant : `relativeDay`
 * les compare à l'horloge.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const CLOSED_DAY = { orders: [order("1", "staff_1")], withdrawn: [], stocks: [] };

describe("GetPackingBoardHandler — le poste dans l'objet des journées", () => {
  it("lit les numéros de production, orders et delivery EN BASE, AVANT les tables", async () => {
    const { handler, log } = boardAround(CLOSED_DAY, { clock: new FixedClock(NOW) });

    await handler.execute(new GetPackingBoardQuery(TODAY));

    expect(log.slice(0, 3).sort()).toEqual([
      "version:delivery",
      "version:orders",
      "version:production",
    ]);
    expect(log.slice(3)).toEqual(["data"]);
  });

  it("range le contenu sous l'étiquette des trois journaux, sans `relativeDay`", async () => {
    const cache = new MemoryDayContents();
    const { handler } = boardAround(CLOSED_DAY, { cache, clock: new FixedClock(NOW) });

    await handler.execute(new GetPackingBoardQuery(TODAY));
    await Promise.resolve();

    expect(cache.stored).toEqual([
      { screen: "packing", day: TODAY, tag: "delivery:3.orders:7.production:42" },
    ]);
  });

  it("sert le contenu rangé sans relire les tables tant que les numéros ne bougent pas", async () => {
    const cache = new MemoryDayContents();
    const { handler, board } = boardAround(CLOSED_DAY, { cache, clock: new FixedClock(NOW) });

    const first = await handler.execute(new GetPackingBoardQuery(TODAY));
    await Promise.resolve();
    const second = await handler.execute(new GetPackingBoardQuery(TODAY));

    expect(board.loads).toBe(1);
    expect(second).toEqual(first);
  });

  it("relit les tables dès qu'un journal monte — un geste de colisage", async () => {
    const cache = new MemoryDayContents();
    const { handler, board, journals } = boardAround(
      { orders: [order("1", null)], withdrawn: [], stocks: [] },
      { cache, clock: new FixedClock(NOW) },
    );
    await handler.execute(new GetPackingBoardQuery(TODAY));
    await Promise.resolve();

    board.day = CLOSED_DAY;
    journals.production.version += 1;
    const after = await handler.execute(new GetPackingBoardQuery(TODAY));

    expect(board.loads).toBe(2);
    expect(after.readyCount).toBe(1);
  });

  it("recalcule `relativeDay` à chaque réponse, sur le contenu rangé", async () => {
    const cache = new MemoryDayContents();
    const clock = new FixedClock(NOW);
    const { handler, board } = boardAround(CLOSED_DAY, { cache, clock });

    const today = await handler.execute(new GetPackingBoardQuery(TODAY));
    await Promise.resolve();
    clock.set(new Date(NOW.getTime() - ONE_DAY_MS));
    const dayBefore = await handler.execute(new GetPackingBoardQuery(TODAY));
    clock.set(new Date(NOW.getTime() + ONE_DAY_MS));
    const dayAfter = await handler.execute(new GetPackingBoardQuery(TODAY));

    expect(board.loads).toBe(1);
    expect([today.relativeDay, dayBefore.relativeDay, dayAfter.relativeDay]).toEqual([
      "today",
      "tomorrow",
      null,
    ]);
  });

  it("un canal en panne fait échouer la réponse : rien n'est servi vide, rien n'est rangé", async () => {
    const cache = new MemoryDayContents();
    const { handler, aftermath } = boardAround(CLOSED_DAY, { cache, clock: new FixedClock(NOW) });
    aftermath.down = true;

    await expect(handler.execute(new GetPackingBoardQuery(TODAY))).rejects.toThrow(
      "commerce injoignable",
    );
    expect(cache.stored).toEqual([]);
  });

  it("une journée vide (liste pas encore arrivée) se range aussi", async () => {
    const cache = new MemoryDayContents();
    const tomorrow = addDays(TODAY, 1);
    const { handler } = boardAround(
      { orders: [], withdrawn: [], stocks: [] },
      { cache, clock: new FixedClock(NOW) },
    );

    const view = await handler.execute(new GetPackingBoardQuery(tomorrow));
    await Promise.resolve();

    expect(view).toMatchObject({ closedAt: null, relativeDay: "tomorrow" });
    expect(cache.stored.map((address) => address.day)).toEqual([tomorrow]);
  });
});

describe("la requête rangée", () => {
  it("ne porte que la journée : ni droits, ni personne, ni horloge", () => {
    expect(Object.keys(new GetPackingBoardQuery(TODAY))).toEqual(["serviceDay"]);
  });
});

describe("le contenu du poste — forme reconnue à la relecture", () => {
  const content = {
    date: "2030-03-12",
    closedAt: null,
    sheets: [],
    withdrawnSheets: [],
    resources: [],
    orderCount: 0,
    todoCount: 0,
    readyCount: 0,
  };

  it("reconnaît un contenu rangé, et le dit rangeable", () => {
    expect(isPackingBoardContent(content)).toBe(true);
    expect(isStorablePackingBoard(content)).toBe(true);
  });

  it("refuse une vue servie (avec `relativeDay`) ou une forme inattendue", () => {
    expect(isPackingBoardContent({ ...content, relativeDay: "today" })).toBe(false);
    expect(isPackingBoardContent({ ...content, sheets: null })).toBe(false);
    expect(isPackingBoardContent(null)).toBe(false);
  });
});
