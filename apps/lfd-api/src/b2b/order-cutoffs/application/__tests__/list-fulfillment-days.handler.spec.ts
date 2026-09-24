import { nextFulfillmentDay, type OrderCutoffView, type PickupAddressView } from "@lfd/contracts";

import {
  catalogItem,
  saleOperationsOver,
} from "../../../catalog/application/__tests__/sale-operations-doubles.js";
import type { SellableOperation } from "../../../catalog/domain/ports/catalog-operations.reader.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { OrderCutoffRepository } from "../../domain/order-cutoff.repository.js";
import { ListFulfillmentDaysHandler } from "../list-fulfillment-days.handler.js";
import { ListFulfillmentDaysQuery } from "../list-fulfillment-days.query.js";

/**
 * D6 : un panier qui porte une bûche ne se voit proposer que des jours de
 * retrait de son opération. Dates comparées à l'horloge figée du handler.
 */

const NOW = new Date("2026-12-01T10:00:00.000Z");

class NoCutoffs extends OrderCutoffRepository {
  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve([]);
  }
  create(): Promise<string> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  update(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  remove(): Promise<OrderCutoffView> {
    return Promise.reject(new Error("écriture inattendue"));
  }
}

class NoPoints extends PickupAddressRepository {
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve([]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(null);
  }
  create(): Promise<string> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  update(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  setDefault(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
}

const NOEL: SellableOperation = {
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-11-01T00:00:00.000Z"),
  orderFrom: null,
  orderUntil: new Date("2026-12-21T11:00:00.000Z"),
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-002-1", "VIE-001-1"],
};

function handler(operations: readonly SellableOperation[] = [NOEL]): ListFulfillmentDaysHandler {
  return new ListFulfillmentDaysHandler(
    new NoCutoffs(),
    new NoPoints(),
    new FixedClock(NOW),
    saleOperationsOver({
      now: NOW,
      operations,
      items: [catalogItem("PAT-002"), catalogItem("VIE-001")],
      onlySkus: ["PAT-002-1"],
    }),
  );
}

describe("ListFulfillmentDaysHandler — les opérations datées", () => {
  it("sans panier, rend la journée des délais du commerce", async () => {
    expect(await handler().execute(new ListFulfillmentDaysQuery())).toEqual([
      { pickupAddressId: null, date: nextFulfillmentDay([], null, NOW) },
    ]);
  });

  it("un panier d'articles courants de l'opération n'est pas contraint", async () => {
    const days = await handler().execute(new ListFulfillmentDaysQuery(["VIE-001"], "public"));
    expect(days[0]?.date).toBe(nextFulfillmentDay([], null, NOW));
  });

  it("un panier qui porte la bûche ne propose que les jours de retrait de Noël", async () => {
    const days = await handler().execute(
      new ListFulfillmentDaysQuery(["VIE-001", "PAT-002"], "public"),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: "2026-12-20" }]);
  });

  it("ne propose aucun jour quand l'opération n'est pas ouverte à cette clientèle", async () => {
    const days = await handler([{ ...NOEL, audience: "pro" }]).execute(
      new ListFulfillmentDaysQuery(["PAT-002"], "public"),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: null }]);
  });
});
