import {
  CurrentArrestHold,
  ProductionDayRetakenEvent,
  ShipmentRef,
} from "../../../../../production/channels/commerce/index.js";
import { DeliveryNoteFollowing } from "../../../domain/ports/delivery-note-following.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../../../domain/ports/order.repository.js";
import { OnProductionDayRetaken } from "../on-production-day-retaken.handler.js";

const DAY = "2026-01-15";
const CLOSED_AT = new Date(0);
const RETAKEN_AT = new Date(3_600_000);

interface Absorption {
  readonly serviceDay: string;
  readonly orderIds: readonly string[];
  readonly at: Date;
}

/** Le dépôt : il note ce qu'on lui demande d'absorber, et rien d'autre ne sert. */
class AbsorbingRepository extends OrderRepository {
  readonly absorbed: Absorption[] = [];

  constructor(private readonly trace: string[]) {
    super();
  }

  absorbIntoPlan(serviceDay: string, orderIds: readonly string[], at: Date): Promise<number> {
    this.trace.push("absorb");
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

/** La prévision des BL (plan E1) : elle note ce qu'on lui demande, après l'absorption. */
class RecordingPlanning extends DeliveryNoteFollowing {
  readonly planned: { orderIds: readonly string[]; closedAt: Date }[] = [];

  constructor(private readonly trace: string[]) {
    super();
  }

  planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void> {
    this.trace.push("plan-notes");
    this.planned.push({ orderIds, closedAt });
    return Promise.resolve();
  }

  prepare(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'arrêt"));
  }

  handOver(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'arrêt"));
  }

  followRevision(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'arrêt"));
  }

  followDecision(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'arrêt du plan"));
  }

  voidLiveFor(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'arrêt"));
  }
}

/**
 * Le fournil doublé : `closed_at` de la journée tenue (`null` = rouverte), et
 * la trace de chaque question, avant tout le reste.
 */
class HeldArrest extends CurrentArrestHold {
  constructor(
    private readonly current: Date | null,
    private readonly trace: string[],
  ) {
    super();
  }

  holdIfCurrent(_serviceDay: string, closedAt: Date): Promise<boolean> {
    this.trace.push("hold");
    return Promise.resolve(this.current?.getTime() === closedAt.getTime());
  }
}

function deliver(payload: Readonly<Record<string, unknown>>, current: Date | null = CLOSED_AT) {
  const trace: string[] = [];
  const orders = new AbsorbingRepository(trace);
  const notes = new RecordingPlanning(trace);
  const run = new OnProductionDayRetaken(orders, notes, new HeldArrest(current, trace)).handle({
    eventId: "evt_1",
    type: "production.day_retaken",
    payload,
  });
  return { orders, notes, trace, run };
}

function retaken(closedAt: Date | null, shipments: readonly ShipmentRef[] | null) {
  return new ProductionDayRetakenEvent(DAY, RETAKEN_AT, 1, shipments, closedAt).durableFact()
    .payload;
}

describe("le commerce apprend qu'un retirage a absorbé des commandes (abonné durable)", () => {
  it("confirme les absorbées et prévoit leur BL à l'instant de l'ARRÊT, pas du retirage", async () => {
    // Régression : aucun abonné du commerce n'écoutait le retirage ; la commande
    // absorbée restait `placed` et le dossier s'imprimait sans son BL-1.
    const payload = retaken(CLOSED_AT, [ShipmentRef.of("ord_1", 1), ShipmentRef.of("ord_1", 2)]);
    const { orders, notes, trace, run } = deliver(payload);

    await run;

    expect(trace).toEqual(["hold", "absorb", "plan-notes"]);
    expect(orders.absorbed).toEqual([{ serviceDay: DAY, orderIds: ["ord_1"], at: CLOSED_AT }]);
    expect(notes.planned).toEqual([{ orderIds: ["ord_1"], closedAt: CLOSED_AT }]);
  });

  it("ne confirme rien sur une journée ROUVERTE", async () => {
    const { orders, notes, trace, run } = deliver(
      retaken(CLOSED_AT, [ShipmentRef.firstOf("ord_1")]),
      null,
    );

    await run;

    expect(trace).toEqual(["hold"]);
    expect(orders.absorbed).toEqual([]);
    expect(notes.planned).toEqual([]);
  });

  it("ne confirme rien sur une journée RÉARRÊTÉE à un autre instant", async () => {
    const later = new Date(CLOSED_AT.getTime() + 60_000);
    const { orders, notes, run } = deliver(
      retaken(CLOSED_AT, [ShipmentRef.firstOf("ord_1")]),
      later,
    );

    await run;

    expect(orders.absorbed).toEqual([]);
    expect(notes.planned).toEqual([]);
  });

  it.each<[string, Date | null, readonly ShipmentRef[] | null]>([
    ["sans arrêt (fait écrit avant le champ)", null, [ShipmentRef.firstOf("ord_1")]],
    ["sans liste d'envois", CLOSED_AT, null],
  ])("ne touche à rien %s", async (_case, closedAt, shipments) => {
    const { orders, trace, run } = deliver(retaken(closedAt, shipments));

    await run;

    expect(trace).toEqual([]);
    expect(orders.absorbed).toEqual([]);
  });
});
