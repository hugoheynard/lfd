import {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../../../../production/channels/packing/index.js";
import { InMemoryResupplies } from "../../__tests__/resupply-doubles.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemoryStocks } from "../../__tests__/station-doubles.js";
import { OnResupplyLaunched } from "../on-resupply-launched.handler.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const DAY = "2026-10-22";
const LAUNCHED = new Date("2026-10-22T07:00:00.000Z");

function fact(servedByTransfer: boolean) {
  return new ResupplyLaunchedEvent(DAY, LAUNCHED, "staff_max", "Max", {
    resupplyId: "rs_asap",
    siteId: servedByTransfer ? "site_village" : "site_labo",
    siteLabel: servedByTransfer ? "Le Village" : "Le Labo",
    name: "Rupture de midi",
    servedByTransfer,
    lines: [
      { sku: "PAC", productName: "Pain au chocolat", quantity: 4, saleUnit: "piece" },
      { sku: "CRO", productName: "Croissant", quantity: 6, saleUnit: "piece" },
      { sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" },
    ],
  }).durableFact();
}

function setup(receivedCro = 0) {
  const table = new InMemoryResupplies();
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: receivedCro, returned: 0 });
  const stocks = new InMemoryStocks(shadow);
  const handler = new OnResupplyLaunched(table, stocks);
  const deliver = (servedByTransfer = true) =>
    handler.handle({
      eventId: "evt_1",
      type: PRODUCTION_RESUPPLY_LAUNCHED,
      payload: fact(servedByTransfer).payload,
    });
  return { table, stocks, deliver };
}

describe("OnResupplyLaunched (colisage, R4b)", () => {
  it("ouvre la fiche « au plus tôt », une ligne par article, à l'instant du lancement", async () => {
    const { table, deliver } = setup();

    await deliver();

    expect(table.rows.get(`${DAY}/rs_asap`)).toMatchObject({
      kind: "asap",
      name: "Rupture de midi",
      siteId: "site_village",
      drawnAt: LAUNCHED,
      closed: null,
      lines: [
        { sku: "CRO", productName: "Croissant", quantity: 8, packed: null },
        { sku: "PAC", productName: "Pain au chocolat", quantity: 4, packed: null },
      ],
    });
  });

  it("réserve chaque ligne sur la réserve du jour, même avant que le four ait remis", async () => {
    const { stocks, deliver } = setup(3);

    await deliver();

    const cro = await stocks.lock(DAY, "CRO");
    expect(cro.reservations).toEqual([
      { resupplyId: "rs_asap", quantity: 8, packed: 0, reservedAt: LAUNCHED, releasedAt: null },
    ]);
    expect(cro.free).toBe(0);
    expect(cro.awaitingOven("rs_asap")).toBe(5);
    expect((await stocks.lock(DAY, "PAC")).reserved).toBe(4);
  });

  /**
   * Régression : la réserve était datée de la LIVRAISON du fait (`clock.now()`),
   * si bien qu'un fait relivré tard passait derrière un réassort lancé après lui
   * dans l'ordre « servi le premier » (audit du réassort, 2026-11-02).
   */
  it("date la réserve du lancement, jamais de la livraison du fait", async () => {
    const { stocks, deliver } = setup(0);

    await deliver();

    const [reservation] = (await stocks.lock(DAY, "CRO")).reservations;
    expect(reservation?.reservedAt).toEqual(LAUNCHED);
  });

  it("le rejeu du fait ne réserve pas deux fois", async () => {
    const { stocks, deliver } = setup(20);

    await deliver();
    await deliver();

    const cro = await stocks.lock(DAY, "CRO");
    expect(cro.reservations).toHaveLength(1);
    expect(cro.free).toBe(12);
  });

  it("ne colise pas un réassort du Labo, servi sur place : ni fiche, ni réserve", async () => {
    const { table, stocks, deliver } = setup(20);

    await deliver(false);

    expect(table.rows.size).toBe(0);
    expect((await stocks.lock(DAY, "CRO")).free).toBe(20);
  });
});
