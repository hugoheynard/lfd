import type { OrderCutoffView } from "@lfd/contracts";

import { StoredOrderCutoffReader } from "../../domain/stored-order-cutoff.reader.js";
import { GeneralOrderCutoffInForce } from "../general-order-cutoff-in-force.js";

/**
 * Les règles EN VIGUEUR : ce que la passation, la boutique, le fournil et la
 * relance lisent. La règle générale seule, toujours — l'interrupteur qui
 * pouvait l'éteindre est retiré le 2026-10-21 (`plan-une-seule-heure.md` §5).
 */

const VEILLE: OrderCutoffView = {
  id: "c1",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "19:00",
  graceMinutes: 30,
};

class Stored extends StoredOrderCutoffReader {
  constructor(private readonly rule: OrderCutoffView | null) {
    super();
  }
  general(): Promise<OrderCutoffView | null> {
    return Promise.resolve(this.rule);
  }
}

describe("GeneralOrderCutoffInForce", () => {
  it("rend la règle générale enregistrée, sans interrupteur à consulter", async () => {
    expect(await new GeneralOrderCutoffInForce(new Stored(VEILLE)).list()).toEqual([VEILLE]);
  });

  it("sans règle posée : n'en rend aucune", async () => {
    expect(await new GeneralOrderCutoffInForce(new Stored(null)).list()).toEqual([]);
  });
});
