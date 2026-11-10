import type { OrderCutoffView } from "@lfd/contracts";

import { StoredOrderCutoffReader } from "../../domain/stored-order-cutoff.reader.js";
import { GetGeneralOrderCutoffHandler } from "../get-general-order-cutoff.handler.js";

class Stored extends StoredOrderCutoffReader {
  constructor(private readonly rule: OrderCutoffView | null) {
    super();
  }
  general(): Promise<OrderCutoffView | null> {
    return Promise.resolve(this.rule);
  }
}

const VEILLE: OrderCutoffView = {
  id: "c1",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "23:00",
  graceMinutes: 0,
};

describe("GetGeneralOrderCutoffHandler", () => {
  it("rend la règle générale rangée", async () => {
    expect(await new GetGeneralOrderCutoffHandler(new Stored(VEILLE)).execute()).toEqual({
      rule: VEILLE,
    });
  });

  it("rend `rule: null` tant qu'elle n'est pas posée — une donnée, pas un corps vide", async () => {
    expect(await new GetGeneralOrderCutoffHandler(new Stored(null)).execute()).toEqual({
      rule: null,
    });
  });
});
