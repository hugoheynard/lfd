import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  PaymentGateway,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RetrievedIntent,
} from "../../../../payments/domain/payment-gateway.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import { UnsettledShopOrderCanceller } from "../../../domain/ports/unsettled-shop-order.canceller.js";
import { UnsettledShopOrderReader } from "../../../domain/ports/unsettled-shop-order.reader.js";
import type { UnsettledSettlement } from "../../../domain/ports/unsettled-settlement.reader.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { RecordingRedemption } from "../../commands/__tests__/voucher-doubles.js";
import { UnsettledShopOrderExpiry } from "../unsettled-shop-order-expiry.service.js";

const MINUTE = 60_000;
const NOW = new Date(1_000 * MINUTE);

/** Une commande du périmètre, passée il y a `minutes`, par `buyer`. */
interface Row extends UnsettledSettlement {
  readonly placedAt: Date;
  readonly buyer: string;
}

function row(orderId: string, minutes: number, buyer = "u_1", voucher: string | null = null): Row {
  return {
    orderId,
    paymentIntentId: `pi_${orderId}`,
    loyaltyVoucherId: voucher,
    placedAt: new Date(NOW.getTime() - minutes * MINUTE),
    buyer,
  };
}

/** Le lecteur : applique la limite et l'acheteur comme la base le ferait. */
class Unsettled extends UnsettledShopOrderReader {
  constructor(private readonly rows: readonly Row[]) {
    super();
  }

  placedBefore(cutoff: Date): Promise<readonly UnsettledSettlement[]> {
    return Promise.resolve(this.rows.filter((r) => r.placedAt < cutoff));
  }

  replacedBy(newOrderId: string): Promise<readonly UnsettledSettlement[]> {
    const placed = this.rows.find((r) => r.orderId === newOrderId);
    if (placed === undefined) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      this.rows.filter((r) => r.buyer === placed.buyer && r.orderId !== newOrderId),
    );
  }
}

/** L'écriture : rend ce que la base aurait franchi, et note la séquence. */
class Canceller extends UnsettledShopOrderCanceller {
  constructor(
    private readonly crossed: ReadonlySet<string>,
    private readonly calls: string[],
  ) {
    super();
  }

  cancel(orderId: string): Promise<boolean> {
    this.calls.push(`cancel-order:${orderId}`);
    return Promise.resolve(this.crossed.has(orderId));
  }
}

/** Stripe : une issue par intention, `cancelled` par défaut. */
class ScriptedGateway extends PaymentGateway {
  constructor(
    private readonly outcomes: ReadonlyMap<string, IntentCancellation>,
    private readonly calls: string[],
  ) {
    super();
  }

  cancelIntent(paymentIntentId: string): Promise<IntentCancellation> {
    this.calls.push(`cancel-intent:${paymentIntentId}`);
    return Promise.resolve(this.outcomes.get(paymentIntentId) ?? { kind: "cancelled" });
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

interface Scenario {
  readonly rows: readonly Row[];
  readonly outcomes?: ReadonlyMap<string, IntentCancellation>;
  readonly crossed?: readonly string[];
}

function build(scenario: Scenario) {
  const calls: string[] = [];
  // Lot E4b (2026-10-10) : le règlement mort s'écrit durable, dans la transaction.
  const events = new RecordingDurable();
  const vouchers = new RecordingRedemption();
  const expiry = new UnsettledShopOrderExpiry(
    new Unsettled(scenario.rows),
    new Canceller(new Set(scenario.crossed ?? scenario.rows.map((r) => r.orderId)), calls),
    new ScriptedGateway(scenario.outcomes ?? new Map(), calls),
    events,
    new DirectUnitOfWork(),
    vouchers,
    new FixedClock(NOW),
  );
  return { expiry, calls, events, vouchers };
}

describe("UnsettledShopOrderExpiry — l'expiration à trente minutes", () => {
  it("annule une commande de 31 minutes et garde celle de 29", async () => {
    const { expiry, calls, events } = build({ rows: [row("old", 31), row("young", 29)] });

    const report = await expiry.expireLapsed();

    expect(report).toEqual({ cancelled: 1, kept: 0 });
    expect(calls).toEqual(["cancel-intent:pi_old", "cancel-order:old"]);
    expect(events.facts).toEqual([new OrderPaymentFailedEvent("old", "expired").durableFact()]);
  });

  it("n'écrit pas quand le paiement est en cours ou déjà pris chez Stripe", async () => {
    const { expiry, calls, events } = build({
      rows: [row("paying", 40), row("paid", 40)],
      outcomes: new Map<string, IntentCancellation>([
        ["pi_paying", { kind: "in_progress" }],
        ["pi_paid", { kind: "already_paid" }],
      ]),
    });

    const report = await expiry.expireLapsed();

    expect(report).toEqual({ cancelled: 0, kept: 2 });
    expect(calls).toEqual(["cancel-intent:pi_paying", "cancel-intent:pi_paid"]);
    expect(events.facts).toEqual([]);
  });

  it("n'écrit pas quand Stripe est injoignable : le passage suivant réessaie", async () => {
    const { expiry, calls } = build({
      rows: [row("old", 40)],
      outcomes: new Map<string, IntentCancellation>([
        ["pi_old", { kind: "unavailable", reason: "ECONNRESET" }],
      ]),
    });

    await expiry.expireLapsed();

    expect(calls).toEqual(["cancel-intent:pi_old"]);
  });

  it("ne publie rien quand la base n'a pas franchi (payée entre-temps)", async () => {
    const { expiry, events, vouchers } = build({
      rows: [row("old", 40, "u_1", "v_1")],
      crossed: [],
    });

    const report = await expiry.expireLapsed();

    expect(report).toEqual({ cancelled: 0, kept: 1 });
    expect(events.facts).toEqual([]);
    expect(vouchers.calls).toEqual([]);
  });

  it("rend le bon de fidélité avec l'annulation", async () => {
    const { expiry, vouchers } = build({ rows: [row("old", 40, "u_1", "v_1")] });

    await expiry.expireLapsed();

    expect(vouchers.calls).toEqual(["release:v_1"]);
  });
});

describe("UnsettledShopOrderExpiry — le remplacement par une nouvelle passation", () => {
  it("annule la précédente du même acheteur, pas celle d'un autre", async () => {
    const { expiry, calls, events } = build({
      rows: [row("mine", 5, "u_1"), row("theirs", 5, "u_2"), row("new", 0, "u_1")],
    });

    const report = await expiry.replaceEarlier("new");

    expect(report).toEqual({ cancelled: 1, kept: 0 });
    expect(calls).toEqual(["cancel-intent:pi_mine", "cancel-order:mine"]);
    expect(events.facts).toEqual([new OrderPaymentFailedEvent("mine", "replaced").durableFact()]);
  });

  it("garde la précédente quand elle est en train d'être payée (§4.4)", async () => {
    const { expiry, events } = build({
      rows: [row("mine", 5, "u_1"), row("new", 0, "u_1")],
      outcomes: new Map<string, IntentCancellation>([["pi_mine", { kind: "in_progress" }]]),
    });

    const report = await expiry.replaceEarlier("new");

    expect(report).toEqual({ cancelled: 0, kept: 1 });
    expect(events.facts).toEqual([]);
  });

  it("ne remplace rien quand la nouvelle commande est hors périmètre", async () => {
    const { expiry, calls } = build({ rows: [row("mine", 5, "u_1")] });

    const report = await expiry.replaceEarlier("staff_placed");

    expect(report).toEqual({ cancelled: 0, kept: 0 });
    expect(calls).toEqual([]);
  });
});
