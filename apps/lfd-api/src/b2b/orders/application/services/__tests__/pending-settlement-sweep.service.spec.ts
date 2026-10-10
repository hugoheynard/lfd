import { ServiceDay } from "../../../../../production/channels/commerce/index.js";
import {
  PaymentGateway,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RetrievedIntent,
} from "../../../../payments/domain/payment-gateway.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../../../domain/ports/order.repository.js";
import {
  UnsettledSettlementReader,
  type UnsettledSettlement,
} from "../../../domain/ports/unsettled-settlement.reader.js";
import type { SettlementSweepWindow } from "../../../domain/services/settlement-sweep.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { RecordingRedemption } from "../../commands/__tests__/voucher-doubles.js";
import { PendingSettlementSweep } from "../pending-settlement-sweep.service.js";

const DAY = "2026-01-15";

/** Les commandes non encaissées de la journée, et la fenêtre demandée. */
class Unsettled extends UnsettledSettlementReader {
  readonly windows: SettlementSweepWindow[] = [];

  constructor(private readonly rows: readonly UnsettledSettlement[]) {
    super();
  }

  unsettledOn(window: SettlementSweepWindow): Promise<readonly UnsettledSettlement[]> {
    this.windows.push(window);
    return Promise.resolve(this.rows);
  }
}

/** Stripe : une issue d'annulation écrite d'avance, et la séquence des gestes. */
class ScriptedGateway extends PaymentGateway {
  constructor(
    private readonly outcome: IntentCancellation,
    private readonly calls: string[],
  ) {
    super();
  }

  cancelIntent(paymentIntentId: string): Promise<IntentCancellation> {
    this.calls.push(`cancel:${paymentIntentId}`);
    return Promise.resolve(this.outcome);
  }

  createIntent(): Promise<CreatedIntent> {
    return Promise.reject(new Error("non utilisé"));
  }

  retrieveIntent(): Promise<RetrievedIntent> {
    return Promise.reject(new Error("non utilisé"));
  }

  publishableKey(): string {
    return "pk_test";
  }

  parseWebhook(): PaymentWebhookEvent {
    return { kind: "ignored" };
  }
}

/** Le dépôt : `failAtClosing` rend ce que la base aurait franchi. */
class ClosingRepository extends OrderRepository {
  constructor(
    private readonly crossed: ReadonlySet<string>,
    private readonly calls: string[],
  ) {
    super();
  }

  failAtClosing(orderId: string): Promise<boolean> {
    this.calls.push(`fail:${orderId}`);
    return Promise.resolve(this.crossed.has(orderId));
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

  absorbIntoPlan(): Promise<number> {
    return Promise.reject(new Error("non utilisé"));
  }
}

interface Scenario {
  readonly rows: readonly UnsettledSettlement[];
  readonly outcome?: IntentCancellation;
  readonly crossed?: readonly string[];
}

function build(scenario: Scenario) {
  const calls: string[] = [];
  const unsettled = new Unsettled(scenario.rows);
  // Lot E4b (2026-10-10) : le règlement mort s'écrit durable, dans la transaction.
  const events = new RecordingDurable();
  const vouchers = new RecordingRedemption();
  const sweep = new PendingSettlementSweep(
    unsettled,
    new ScriptedGateway(scenario.outcome ?? { kind: "cancelled" }, calls),
    new ClosingRepository(
      new Set(scenario.crossed ?? scenario.rows.map((row) => row.orderId)),
      calls,
    ),
    events,
    new DirectUnitOfWork(),
    vouchers,
    new FixedClock(new Date(0)),
  );
  return { run: () => sweep.sweep(ServiceDay.of(DAY)), unsettled, events, calls, vouchers };
}

describe("PendingSettlementSweep — la clôture coupe les règlements en vol", () => {
  it("demande la journée ET son jour de passation à Paris (Q5)", async () => {
    const { run, unsettled } = build({ rows: [] });

    await run();

    expect(unsettled.windows).toEqual([
      {
        serviceDay: DAY,
        placedFrom: new Date("2026-01-14T23:00:00.000Z"),
        placedBefore: new Date("2026-01-15T23:00:00.000Z"),
      },
    ]);
  });

  it("annule l'intention, PUIS écrit, puis publie la cause `day_closed`", async () => {
    const { run, events, calls } = build({
      rows: [
        { orderId: "ord_1", paymentIntentId: "pi_1", loyaltyVoucherId: null },
        { orderId: "ord_2", paymentIntentId: "pi_2", loyaltyVoucherId: null },
      ],
    });

    await run();

    expect(calls).toEqual(["cancel:pi_1", "fail:ord_1", "cancel:pi_2", "fail:ord_2"]);
    expect(events.facts).toEqual([
      new OrderPaymentFailedEvent("ord_1", "day_closed").durableFact(),
      new OrderPaymentFailedEvent("ord_2", "day_closed").durableFact(),
    ]);
  });

  it("écrit sans appeler Stripe quand la commande n'a pas d'intention", async () => {
    const { run, calls } = build({
      rows: [{ orderId: "ord_1", paymentIntentId: null, loyaltyVoucherId: null }],
    });

    await run();

    expect(calls).toEqual(["fail:ord_1"]);
  });

  it.each<IntentCancellation>([
    { kind: "unavailable", reason: "ECONNRESET" },
    { kind: "already_cancelled" },
  ])(
    "écrit même quand Stripe ne confirme pas (%o) — il ne bloque jamais la clôture (B1)",
    async (outcome) => {
      const { run, calls, events } = build({
        rows: [{ orderId: "ord_1", paymentIntentId: "pi_1", loyaltyVoucherId: null }],
        outcome,
      });

      await expect(run()).resolves.toBeUndefined();

      expect(calls).toEqual(["cancel:pi_1", "fail:ord_1"]);
      expect(events.facts).toEqual([
        new OrderPaymentFailedEvent("ord_1", "day_closed").durableFact(),
      ]);
    },
  );

  /**
   * Régression : la clôture annulait aussi une commande dont Stripe disait
   * l'argent déjà pris ou en train de l'être — une vente réelle, remboursée, et
   * un client à qui l'on écrivait « rien n'a été débité » (corrigé le
   * 2026-09-26, avant tout déploiement).
   */
  it.each<IntentCancellation>([{ kind: "already_paid" }, { kind: "in_progress" }])(
    "épargne une commande dont l'argent est pris ou en route (%o)",
    async (outcome) => {
      const { run, calls, events } = build({
        rows: [{ orderId: "ord_1", paymentIntentId: "pi_1", loyaltyVoucherId: null }],
        outcome,
      });

      await run();

      expect(calls).toEqual(["cancel:pi_1"]);
      expect(events.facts).toEqual([]);
    },
  );

  it("ne republie rien pour ce que la base n'a pas franchi (réannonce, S4)", async () => {
    const { run, events } = build({
      rows: [{ orderId: "ord_1", paymentIntentId: "pi_1", loyaltyVoucherId: null }],
      crossed: [],
    });

    await run();

    expect(events.facts).toEqual([]);
  });
});

/**
 * `failAtClosing` est la seconde écriture de `cancelled` : quand elle franchit,
 * le bon engagé revient (plan des points, C4).
 */
describe("PendingSettlementSweep — le bon de fidélité", () => {
  it("libère le bon de la commande annulée à la clôture, et d'elle seule", async () => {
    const { run, vouchers } = build({
      rows: [
        { orderId: "ord_1", paymentIntentId: "pi_1", loyaltyVoucherId: "v1" },
        { orderId: "ord_2", paymentIntentId: "pi_2", loyaltyVoucherId: "v2" },
      ],
      crossed: ["ord_1"],
    });

    await run();

    expect(vouchers.calls).toEqual(["release:v1"]);
  });

  it("ne libère rien pour une commande épargnée (paiement déjà pris)", async () => {
    const { run, vouchers } = build({
      rows: [{ orderId: "ord_1", paymentIntentId: "pi_1", loyaltyVoucherId: "v1" }],
      outcome: { kind: "already_paid" },
    });

    await run();

    expect(vouchers.calls).toEqual([]);
  });
});
