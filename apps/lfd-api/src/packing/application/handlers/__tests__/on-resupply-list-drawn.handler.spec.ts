import {
  PRODUCTION_RESUPPLY_LIST_DRAWN,
  ResupplyListDrawnEvent,
  ResupplyListDrawnPayloadError,
} from "../../../../production/channels/packing/index.js";
import { InMemoryResupplies } from "../../__tests__/resupply-doubles.js";
import { OnResupplyListDrawn } from "../on-resupply-list-drawn.handler.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const DAY = "2026-10-22";
const DRAWN = new Date("2026-10-21T18:00:00.000Z");

const delivery = (payload: Readonly<Record<string, unknown>>) => ({
  eventId: "evt_1",
  type: PRODUCTION_RESUPPLY_LIST_DRAWN,
  payload,
});

const FACT = new ResupplyListDrawnEvent(DAY, DRAWN, {
  resupplyId: "rs_1",
  siteId: "site_village",
  siteLabel: "Le Village",
  lines: [
    { sku: "CRO", productName: "Croissant", quantity: 6 },
    { sku: "CRO", productName: "Croissant", quantity: 6 },
  ],
}).durableFact();

describe("OnResupplyListDrawn (colisage, R3b)", () => {
  it("ouvre la fiche du réassort, une ligne par article", async () => {
    const table = new InMemoryResupplies();

    await new OnResupplyListDrawn(table).handle(delivery(FACT.payload));

    expect(table.rows.get(`${DAY}/rs_1`)).toEqual({
      serviceDay: DAY,
      resupplyId: "rs_1",
      siteId: "site_village",
      siteLabel: "Le Village",
      drawnAt: DRAWN,
      closed: null,
      lines: [{ sku: "CRO", productName: "Croissant", quantity: 12, packed: null }],
    });
  });

  it("un rejeu ne réécrit pas une fiche déjà entamée", async () => {
    const table = new InMemoryResupplies();
    const handler = new OnResupplyListDrawn(table);
    await handler.handle(delivery(FACT.payload));
    const before = table.rows.get(`${DAY}/rs_1`);

    await handler.handle(delivery(FACT.payload));

    expect(table.rows.get(`${DAY}/rs_1`)).toBe(before);
  });

  it("refuse un fait hors contrat", async () => {
    const table = new InMemoryResupplies();

    await expect(
      new OnResupplyListDrawn(table).handle(delivery({ serviceDay: DAY })),
    ).rejects.toThrow(ResupplyListDrawnPayloadError);
  });
});
