import {
  type DayDueThresholds,
  DueThresholdsReader,
} from "../../../channels/commerce/due-thresholds.reader.js";
import { ProductionTrancheSettings } from "../../../domain/entities/production-tranche-settings.js";
import { InvalidServiceDayError } from "../../../domain/errors/production-errors.js";
import type { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryTrancheSettings } from "../../__tests__/production-tranche-settings-doubles.js";
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

function handlerOf(commerce: Commerce, posed: ProductionTrancheSettings | null) {
  return new GetProductionDueThresholdsHandler(
    commerce,
    new InMemoryTrancheSettings(posed).reader(),
  );
}

const COMPUTED = ProductionTrancheSettings.set("computed", ["05:00"]);

describe("GetProductionDueThresholdsHandler", () => {
  it("en mode calculé, demande au commerce la journée nommée et rend ses seuils tels quels", async () => {
    const commerce = new Commerce(DUE);

    const view = await handlerOf(commerce, COMPUTED).execute(
      new GetProductionDueThresholdsQuery("2030-01-15"),
    );

    expect(commerce.asked).toEqual(["2030-01-15"]);
    expect(view).toEqual({
      date: "2030-01-15",
      deliveryMarginMinutes: 50,
      pickupMarginMinutes: null,
      trancheMode: "computed",
      fixedTranches: [],
      lines: DUE.items,
    });
  });

  it("en mode fixe, range les besoins dans les heures réglées et les nomme", async () => {
    const view = await handlerOf(
      new Commerce(DUE),
      ProductionTrancheSettings.set("fixed", ["05:00", "07:00"]),
    ).execute(new GetProductionDueThresholdsQuery("2030-01-15"));

    expect(view.trancheMode).toBe("fixed");
    expect(view.fixedTranches).toEqual(["05:00", "07:00"]);
    expect(view.lines[0]?.thresholds).toEqual([
      { kind: "deadline", before: "05:00", quantity: 10, cumulative: 10 },
      { kind: "undated", before: null, quantity: 5, cumulative: 15 },
    ]);
  });

  it("sans réglage : mode fixe sans heure, une seule tranche, la journée", async () => {
    const view = await handlerOf(new Commerce(DUE), null).execute(
      new GetProductionDueThresholdsQuery("2030-01-15"),
    );

    expect(view.trancheMode).toBe("fixed");
    expect(view.fixedTranches).toEqual([]);
    expect(view.lines[0]?.thresholds).toEqual([
      { kind: "day", before: null, quantity: 15, cumulative: 15 },
    ]);
  });

  it("refuse un jour mal formé sans rien demander au commerce", async () => {
    const commerce = new Commerce(DUE);

    await expect(
      handlerOf(commerce, null).execute(new GetProductionDueThresholdsQuery("15/01/2030")),
    ).rejects.toThrow(InvalidServiceDayError);
    expect(commerce.asked).toEqual([]);
  });
});
