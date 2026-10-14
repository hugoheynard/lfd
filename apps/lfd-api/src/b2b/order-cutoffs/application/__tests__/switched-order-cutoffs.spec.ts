import {
  DEFAULT_ORDER_CUTOFF_SETTINGS,
  type OrderCutoffPayload,
  type OrderCutoffSettingsView,
  type OrderCutoffView,
} from "@lfd/contracts";

import { OrderCutoffSettingsReader } from "../../domain/order-cutoff-settings.reader.js";
import { OrderCutoffRepository } from "../../domain/order-cutoff.repository.js";
import { SwitchedOrderCutoffs } from "../switched-order-cutoffs.js";

/**
 * Les règles EN VIGUEUR (lot O3, `plan-reglages-commandes.md` §8.1, S3/S4) :
 * ce que la passation, la boutique, le fournil et la relance lisent.
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

/** La table : compte ses lectures, refuse toute écriture. */
class Table extends OrderCutoffRepository {
  reads = 0;
  list(): Promise<readonly OrderCutoffView[]> {
    this.reads += 1;
    return Promise.resolve([VEILLE]);
  }
  create(_payload: OrderCutoffPayload): Promise<string> {
    return Promise.reject(new TypeError("écriture inattendue"));
  }
  update(): Promise<void> {
    return Promise.reject(new TypeError("écriture inattendue"));
  }
  remove(): Promise<OrderCutoffView> {
    return Promise.reject(new TypeError("écriture inattendue"));
  }
}

describe("SwitchedOrderCutoffs", () => {
  it("activée (défaut, ligne absente) : rend les règles de la table", async () => {
    const table = new Table();
    const rules = await new SwitchedOrderCutoffs(
      new Switch(DEFAULT_ORDER_CUTOFF_SETTINGS),
      table,
    ).list();

    expect(rules).toEqual([VEILLE]);
  });

  it("désactivée : n'en rend aucune, sans même lire la table", async () => {
    const table = new Table();
    const rules = await new SwitchedOrderCutoffs(
      new Switch({ enabled: false, sameDayAllowed: false, updatedAt: null, updatedBy: null }),
      table,
    ).list();

    expect(rules).toEqual([]);
    expect(table.reads).toBe(0);
  });
});
