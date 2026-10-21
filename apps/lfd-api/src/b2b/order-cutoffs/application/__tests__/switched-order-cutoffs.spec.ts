import {
  DEFAULT_ORDER_CUTOFF_SETTINGS,
  type OrderCutoffSettingsView,
  type OrderCutoffView,
} from "@lfd/contracts";

import { OrderCutoffSettingsReader } from "../../domain/order-cutoff-settings.reader.js";
import { StoredOrderCutoffReader } from "../../domain/stored-order-cutoff.reader.js";
import { SwitchedOrderCutoffs } from "../switched-order-cutoffs.js";

/**
 * Les règles EN VIGUEUR (lot O3, `plan-reglages-commandes.md` §8.1, S3/S4) :
 * ce que la passation, la boutique, le fournil et la relance lisent. Depuis
 * le 2026-10-21, la règle générale seule.
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

class Switch extends OrderCutoffSettingsReader {
  constructor(private readonly view: OrderCutoffSettingsView) {
    super();
  }
  current(): Promise<OrderCutoffSettingsView> {
    return Promise.resolve(this.view);
  }
}

/** La règle rangée : compte ses lectures. */
class Stored extends StoredOrderCutoffReader {
  reads = 0;
  constructor(private readonly rule: OrderCutoffView | null) {
    super();
  }
  general(): Promise<OrderCutoffView | null> {
    this.reads += 1;
    return Promise.resolve(this.rule);
  }
}

const OFF: OrderCutoffSettingsView = {
  enabled: false,
  sameDayAllowed: false,
  updatedAt: null,
  updatedBy: null,
};

describe("SwitchedOrderCutoffs", () => {
  it("activée (défaut, ligne absente) : rend la règle générale", async () => {
    const stored = new Stored(VEILLE);
    const rules = await new SwitchedOrderCutoffs(
      new Switch(DEFAULT_ORDER_CUTOFF_SETTINGS),
      stored,
    ).list();

    expect(rules).toEqual([VEILLE]);
  });

  it("activée sans règle posée : n'en rend aucune", async () => {
    const rules = await new SwitchedOrderCutoffs(
      new Switch(DEFAULT_ORDER_CUTOFF_SETTINGS),
      new Stored(null),
    ).list();

    expect(rules).toEqual([]);
  });

  it("désactivée : n'en rend aucune, sans même lire la règle", async () => {
    const stored = new Stored(VEILLE);
    const rules = await new SwitchedOrderCutoffs(new Switch(OFF), stored).list();

    expect(rules).toEqual([]);
    expect(stored.reads).toBe(0);
  });
});
