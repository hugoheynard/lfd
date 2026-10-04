import {
  ProductionDayClosedEvent,
  ProductionDayClosedPayloadError,
} from "../../../../../production/channels/commerce/index.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../../../domain/ports/order.repository.js";
import { OnProductionDayClosed } from "../on-production-day-closed.handler.js";

const DAY = "2026-01-15";
const CLOSED_AT = new Date(0);

interface Absorption {
  readonly serviceDay: string;
  readonly orderIds: readonly string[];
  readonly at: Date;
}

/** Le dépôt : il note ce qu'on lui demande d'absorber, et rien d'autre ne sert. */
class AbsorbingRepository extends OrderRepository {
  readonly absorbed: Absorption[] = [];

  absorbIntoPlan(serviceDay: string, orderIds: readonly string[], at: Date): Promise<number> {
    this.absorbed.push({ serviceDay, orderIds, at });
    return Promise.resolve(orderIds.length);
  }

  failAtClosing(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markAbandoned(): Promise<AbandonedSettlement | null> {
    return Promise.reject(new Error("non utilisé"));
  }

  place(): Promise<PlacedOrder> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPaid(): Promise<string | null> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPaymentFailed(): Promise<string | null> {
    return Promise.reject(new Error("non utilisé"));
  }

  markFulfilled(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markReady(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }
}

function deliver(payload: Readonly<Record<string, unknown>>) {
  const orders = new AbsorbingRepository();
  const run = new OnProductionDayClosed(orders).handle({
    eventId: "evt_1",
    type: "production.day_closed",
    payload,
  });
  return { orders, run };
}

describe("le commerce apprend qu'une journée est arrêtée (abonné durable)", () => {
  it("absorbe les commandes de l'INSTANTANÉ, à l'instant de la clôture", async () => {
    // Régression : l'absorption prenait toute la journée `placed`, si bien
    // qu'une livraison reprise confirmait des commandes passées après l'arrêt.
    const fact = new ProductionDayClosedEvent(DAY, CLOSED_AT, ["ord_1", "ord_2"]).durableFact();
    const { orders, run } = deliver(fact.payload);

    await run;

    expect(orders.absorbed).toEqual([
      { serviceDay: DAY, orderIds: ["ord_1", "ord_2"], at: CLOSED_AT },
    ]);
  });

  it("une réannonce absorbe à l'instant d'ORIGINE, pas à celui du geste", async () => {
    const fact = new ProductionDayClosedEvent(DAY, CLOSED_AT, ["ord_1"], new Date(1)).durableFact();
    const { orders, run } = deliver(fact.payload);

    await run;

    expect(orders.absorbed[0]?.at).toEqual(CLOSED_AT);
  });

  it.each<[string, Readonly<Record<string, unknown>>]>([
    ["sans journée", { closedAt: CLOSED_AT.toISOString(), orderIds: [] }],
    ["instant illisible", { serviceDay: DAY, closedAt: "hier", orderIds: [] }],
    ["commandes absentes", { serviceDay: DAY, closedAt: CLOSED_AT.toISOString() }],
    [
      "commande non textuelle",
      { serviceDay: DAY, closedAt: CLOSED_AT.toISOString(), orderIds: [1] },
    ],
  ])("REFUSE un payload hors contrat (%s) sans rien écrire", async (_case, payload) => {
    const { orders, run } = deliver(payload);

    await expect(run).rejects.toThrow(ProductionDayClosedPayloadError);
    expect(orders.absorbed).toEqual([]);
  });
});
