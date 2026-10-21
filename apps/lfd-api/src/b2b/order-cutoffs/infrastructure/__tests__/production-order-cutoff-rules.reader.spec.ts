import type { OrderCutoffView } from "@lfd/contracts";

import { OrderCutoffsInForce } from "../../domain/order-cutoffs-in-force.js";
import { ProductionOrderCutoffRulesReader } from "../production-order-cutoff-rules.reader.js";

/** Les règles en vigueur, doublées. */
class InForce extends OrderCutoffsInForce {
  constructor(private readonly rows: readonly OrderCutoffView[]) {
    super();
  }

  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rows);
  }
}

const GENERAL: OrderCutoffView = {
  id: "c-2",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 2,
  time: "20:00",
  graceMinutes: 0,
};

describe("ProductionOrderCutoffRulesReader", () => {
  it("rend au fournil la règle générale, sans son identifiant", async () => {
    const reader = new ProductionOrderCutoffRulesReader(new InForce([GENERAL]));

    expect(await reader.rules()).toEqual([{ daysBefore: 2, time: "20:00", graceMinutes: 0 }]);
  });

  /**
   * Décision de Hugo du 2026-10-21 : les règles par point × jour sont
   * retirées. Une ligne résiduelle ne doit plus borner l'heure d'arrêt du plan.
   */
  it("ignore une règle résiduelle à point ou à jour", async () => {
    const reader = new ProductionOrderCutoffRulesReader(
      new InForce([
        { ...GENERAL, id: "c-1", pickupAddressId: "p-1", pickupLabel: "Atelier", time: "23:30" },
        { ...GENERAL, id: "c-3", weekday: "sat", time: "23:45" },
        GENERAL,
      ]),
    );

    expect(await reader.rules()).toEqual([{ daysBefore: 2, time: "20:00", graceMinutes: 0 }]);
  });

  it("aucune règle en vigueur : rien à rendre", async () => {
    expect(await new ProductionOrderCutoffRulesReader(new InForce([])).rules()).toEqual([]);
  });
});
