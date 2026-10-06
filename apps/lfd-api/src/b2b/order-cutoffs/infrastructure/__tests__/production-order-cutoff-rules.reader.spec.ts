import type { OrderCutoffPayload, OrderCutoffView } from "@lfd/contracts";

import { OrderCutoffRepository } from "../../domain/order-cutoff.repository.js";
import { ProductionOrderCutoffRulesReader } from "../production-order-cutoff-rules.reader.js";

/** Les règles doublées : seule la lecture sert ici. */
class Cutoffs extends OrderCutoffRepository {
  constructor(private readonly rows: readonly OrderCutoffView[]) {
    super();
  }

  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rows);
  }

  create(_payload: OrderCutoffPayload): Promise<string> {
    return Promise.reject(new TypeError("écriture non attendue"));
  }

  update(_id: string, _payload: OrderCutoffPayload): Promise<void> {
    return Promise.reject(new TypeError("écriture non attendue"));
  }

  remove(_id: string): Promise<OrderCutoffView> {
    return Promise.reject(new TypeError("écriture non attendue"));
  }
}

describe("ProductionOrderCutoffRulesReader", () => {
  it("rend au fournil chaque règle, sans son point ni son jour", async () => {
    const reader = new ProductionOrderCutoffRulesReader(
      new Cutoffs([
        {
          id: "c-1",
          pickupAddressId: "p-1",
          pickupLabel: "Atelier",
          weekday: "sat",
          daysBefore: 1,
          time: "17:00",
          graceMinutes: 30,
        },
        {
          id: "c-2",
          pickupAddressId: null,
          pickupLabel: null,
          weekday: null,
          daysBefore: 2,
          time: "20:00",
          graceMinutes: 0,
        },
      ]),
    );

    expect(await reader.rules()).toEqual([
      { daysBefore: 1, time: "17:00", graceMinutes: 30 },
      { daysBefore: 2, time: "20:00", graceMinutes: 0 },
    ]);
  });
});
