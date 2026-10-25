import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { closedDay, FixedDays } from "../../__tests__/quality-doubles.js";
import { DayInscribedOrderHeaderReader } from "../day-inscribed-order-header.reader.js";

/**
 * L'en-tête figé d'une commande, pour la pierre tombale du colisage (plan A1,
 * § 2.2). Instant recopié, jamais comparé à l'horloge — exception du §5.
 */

const DAY = "2026-10-13";
const AT = new Date("2026-10-12T20:00:00.000Z");

function reader(): DayInscribedOrderHeaderReader {
  return new DayInscribedOrderHeaderReader(new FixedDays(closedDay(ServiceDay.of(DAY), AT, [])));
}

describe("DayInscribedOrderHeaderReader", () => {
  it("rend l'en-tête que la clôture a figé", async () => {
    await expect(reader().headerOf(DAY, "ord_1")).resolves.toEqual({
      reference: "ORD-0001",
      customerLabel: "Trois Ponts",
      fulfillmentMethod: "pickup",
      dueAt: null,
      clientele: null,
      siteId: null,
    });
  });

  it("une commande absente du plan : `null`, rien d'inventé", async () => {
    await expect(reader().headerOf(DAY, "ord_inconnue")).resolves.toBeNull();
  });
});
