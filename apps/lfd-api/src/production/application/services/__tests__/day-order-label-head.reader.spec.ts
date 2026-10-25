import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { closedDay, FixedDays } from "../../__tests__/quality-doubles.js";
import { DayOrderLabelHeadReader } from "../day-order-label-head.reader.js";

/**
 * Le libellé et le créneau de l'étiquette d'un sac, titrés par le fournil
 * (2026-10-25). Instant recopié, jamais comparé à l'horloge — exception du §5.
 */

const DAY = "2026-10-13";
const AT = new Date("2026-10-12T20:00:00.000Z");

function reader(): DayOrderLabelHeadReader {
  return new DayOrderLabelHeadReader(new FixedDays(closedDay(ServiceDay.of(DAY), AT, [])));
}

describe("DayOrderLabelHeadReader", () => {
  it("rend le libellé du dossier du jour et le créneau de l'en-tête du bon", async () => {
    await expect(reader().headOf(DAY, "ord_1")).resolves.toEqual({
      fulfillmentLabel: "Retrait Le Labo",
      when: "Sans heure convenue",
    });
  });

  it("une commande absente du plan : `null`, rien d'inventé", async () => {
    await expect(reader().headOf(DAY, "ord_inconnue")).resolves.toBeNull();
  });
});
