import {
  type DayDueThresholds,
  DueThresholdsReader,
} from "../../../channels/commerce/due-thresholds.reader.js";
import { InvalidServiceDayError } from "../../../domain/errors/production-errors.js";
import type { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { GetProductionDueThresholdsHandler } from "../get-production-due-thresholds.handler.js";
import { GetProductionDueThresholdsQuery } from "../get-production-due-thresholds.query.js";

/** Le commerce, doublé : il rend des seuils tout faits et retient le jour demandé. */
class Commerce extends DueThresholdsReader {
  readonly asked: string[] = [];
  constructor(private readonly due: DayDueThresholds) {
    super();
  }
  dueThresholdsFor(day: ServiceDay): Promise<DayDueThresholds> {
    this.asked.push(day.value);
    return Promise.resolve(this.due);
  }
}

const DUE: DayDueThresholds = {
  deliveryMarginMinutes: 50,
  pickupMarginMinutes: null,
  items: [
    {
      sku: "BAG",
      productName: "Baguette",
      total: 15,
      thresholds: [
        { kind: "deadline", before: "05:10", quantity: 10, cumulative: 10 },
        { kind: "undated", before: null, quantity: 5, cumulative: 15 },
      ],
    },
  ],
};

describe("GetProductionDueThresholdsHandler", () => {
  it("demande au commerce la journée nommée et rend ses seuils tels quels", async () => {
    const commerce = new Commerce(DUE);

    const view = await new GetProductionDueThresholdsHandler(commerce).execute(
      new GetProductionDueThresholdsQuery("2030-01-15"),
    );

    expect(commerce.asked).toEqual(["2030-01-15"]);
    expect(view).toEqual({
      date: "2030-01-15",
      deliveryMarginMinutes: 50,
      pickupMarginMinutes: null,
      lines: DUE.items,
    });
  });

  it("refuse un jour mal formé sans rien demander au commerce", async () => {
    const commerce = new Commerce(DUE);

    await expect(
      new GetProductionDueThresholdsHandler(commerce).execute(
        new GetProductionDueThresholdsQuery("15/01/2030"),
      ),
    ).rejects.toThrow(InvalidServiceDayError);
    expect(commerce.asked).toEqual([]);
  });
});
