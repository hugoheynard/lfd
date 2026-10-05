import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  PaymentGateway,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RetrievedIntent,
} from "../../../../payments/domain/payment-gateway.js";
import {
  OrderAbandonNotAuthorError,
  OrderAbandonUnavailableError,
  OrderNotAbandonableError,
  OrderPaymentAlreadyReceivedError,
  OrderPaymentInProgressError,
} from "../../../domain/errors/order-abandon-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderAbandonedEvent } from "../../../domain/events/order-abandoned.event.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../../../domain/ports/order.repository.js";
import { OneOrderReader, orderView } from "../../handlers/__tests__/payment-failure-doubles.js";
import { AbandonOrderCommand } from "../abandon-order.command.js";
import { AbandonOrderHandler } from "../abandon-order.handler.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingRedemption } from "./voucher-doubles.js";

/** Un seul rôle, pour tout demandeur : membre (`orders`) ou étranger (`null`). */
class OneRoleGuard extends OrderGuardReader {
  constructor(private readonly role: OrderRole | null) {
    super();
  }

  roleOf(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.reject(new Error("non utilisé"));
  }

  settlesOnAccount(): Promise<AccountSettlementStanding> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Le prestataire : une issue d'annulation écrite d'avance, et les appels vus. */
class ScriptedGateway extends PaymentGateway {
  readonly cancelled: string[] = [];

  constructor(private readonly outcome: IntentCancellation) {
    super();
  }

  cancelIntent(paymentIntentId: string): Promise<IntentCancellation> {
    this.cancelled.push(paymentIntentId);
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

/** Le dépôt : ce que la base aurait écrit, et les appels vus. */
class AbandonRepository extends OrderRepository {
  readonly abandoned: string[] = [];

  constructor(private readonly written: AbandonedSettlement | null) {
    super();
  }

  markAbandoned(orderId: string): Promise<AbandonedSettlement | null> {
    this.abandoned.push(orderId);
    return Promise.resolve(this.written);
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

  failAtClosing(): Promise<boolean> {
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
  readonly status?: OrderStatus;
  readonly payment?: PaymentStatus;
  readonly companyId?: string | null;
  readonly author?: string;
  readonly intent?: string | null;
  readonly role?: OrderRole | null;
  readonly outcome?: IntentCancellation;
  readonly written?: AbandonedSettlement | null;
  readonly clientele?: "pro" | "public" | null;
  readonly voucher?: string | null;
}

function build(scenario: Scenario = {}) {
  const gateway = new ScriptedGateway(scenario.outcome ?? { kind: "cancelled" });
  const repository = new AbandonRepository(
    scenario.written === undefined ? "cancelled" : scenario.written,
  );
  const events = new RecordingPublisher();
  const reader = new OneOrderReader({
    view: orderView(scenario.status ?? "placed", scenario.payment ?? "pending"),
    companyId: scenario.companyId ?? null,
    placedByUserId: scenario.author ?? "u1",
    stripePaymentIntentId: scenario.intent === undefined ? "pi_1" : scenario.intent,
    clientele: scenario.clientele === undefined ? "public" : scenario.clientele,
    loyaltyVoucherId: scenario.voucher ?? null,
    billedCustomer: null,
  });
  const vouchers = new RecordingRedemption();
  const handler = new AbandonOrderHandler(
    new OneRoleGuard(scenario.role ?? null),
    reader,
    repository,
    gateway,
    events,
    new DirectUnitOfWork(),
    vouchers,
    new FixedClock(new Date(0)),
  );
  const abandon = (actor = "u1") => handler.execute(new AbandonOrderCommand(actor, "order_1"));
  return { abandon, gateway, repository, events, vouchers };
}

describe("AbandonOrderHandler — l'ordre des gestes", () => {
  it("annule l'intention chez Stripe, PUIS écrit, puis publie le fait et l'acte", async () => {
    const { abandon, gateway, repository, events } = build();

    await abandon();

    expect(gateway.cancelled).toEqual(["pi_1"]);
    expect(repository.abandoned).toEqual(["order_1"]);
    expect(events.published).toEqual([
      new OrderPaymentFailedEvent("order_1", "abandoned"),
      new OrderAbandonedEvent("order_1", "ORD-4812", "u1", "cancelled"),
    ]);
  });

  it("une intention déjà annulée est un succès : c'est le second clic chez Stripe", async () => {
    const { abandon, repository } = build({ outcome: { kind: "already_cancelled" } });

    await abandon();

    expect(repository.abandoned).toEqual(["order_1"]);
  });

  it("rapporte ce que la base a écrit — un pro garde sa commande, son règlement tombe", async () => {
    const { abandon, events } = build({
      written: "failed",
      companyId: "cmp_1",
      role: "orders",
      clientele: "pro",
    });

    await abandon();

    expect(events.published).toEqual([
      new OrderPaymentFailedEvent("order_1", "abandoned"),
      new OrderAbandonedEvent("order_1", "ORD-4812", "u1", "failed"),
    ]);
  });

  it("ne publie rien quand la base n'a rien franchi (second clic d'un pro)", async () => {
    const { abandon, events } = build({ written: null, payment: "failed" });

    await abandon();

    expect(events.published).toEqual([]);
  });

  it("écrit sans appeler Stripe quand la commande n'a pas d'intention", async () => {
    const { abandon, gateway, repository } = build({ intent: null });

    await abandon();

    expect(gateway.cancelled).toEqual([]);
    expect(repository.abandoned).toEqual(["order_1"]);
  });
});

describe("AbandonOrderHandler — un pro garde son intention vivante (Q8)", () => {
  it.each([["pro" as const], [null]])(
    "clientèle %s : n'appelle pas Stripe, écrit le refus — payable jusqu'à la clôture",
    async (clientele) => {
      const { abandon, gateway, repository } = build({
        clientele,
        written: "failed",
        companyId: "cmp_1",
        role: "orders",
      });

      await abandon();

      expect(gateway.cancelled).toEqual([]);
      expect(repository.abandoned).toEqual(["order_1"]);
    },
  );

  it("Stripe injoignable ne refuse pas l'abandon d'un pro : on ne l'appelle pas", async () => {
    const { abandon, repository } = build({
      clientele: "pro",
      written: "failed",
      outcome: { kind: "unavailable", reason: "ECONNRESET" },
    });

    await expect(abandon()).resolves.toBeUndefined();
    expect(repository.abandoned).toEqual(["order_1"]);
  });
});

describe("AbandonOrderHandler — les issues de Stripe qui interdisent d'écrire (§5)", () => {
  it.each([
    [{ kind: "already_paid" } as const, OrderPaymentAlreadyReceivedError],
    [{ kind: "in_progress" } as const, OrderPaymentInProgressError],
    [{ kind: "unavailable", reason: "ECONNRESET" } as const, OrderAbandonUnavailableError],
  ])("%o → refus nommé, rien d'écrit, rien de publié", async (outcome, error) => {
    const { abandon, repository, events } = build({ outcome });

    await expect(abandon()).rejects.toBeInstanceOf(error);
    expect(repository.abandoned).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("AbandonOrderHandler — l'état et le mur", () => {
  it("une commande déjà annulée répond comme la première fois, sans rappeler Stripe", async () => {
    const { abandon, gateway, repository } = build({ status: "cancelled", payment: "failed" });

    await abandon();

    expect(gateway.cancelled).toEqual([]);
    expect(repository.abandoned).toEqual([]);
  });

  it("refuse une commande déjà encaissée, sans toucher à Stripe", async () => {
    const { abandon, gateway } = build({ payment: "paid" });

    await expect(abandon()).rejects.toBeInstanceOf(OrderNotAbandonableError);
    expect(gateway.cancelled).toEqual([]);
  });

  it("cache la commande d'un autre particulier (404)", async () => {
    const { abandon, gateway } = build({ author: "u_autre" });

    await expect(abandon()).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(gateway.cancelled).toEqual([]);
  });

  it("refuse un autre membre de la société (403) : il la lit, il ne la détruit pas", async () => {
    const { abandon, gateway } = build({ companyId: "cmp_1", role: "owner", author: "u_auteur" });

    await expect(abandon("u1")).rejects.toBeInstanceOf(OrderAbandonNotAuthorError);
    expect(gateway.cancelled).toEqual([]);
  });

  it("cache la commande d'une société dont on n'est pas membre (404)", async () => {
    const { abandon } = build({ companyId: "cmp_1", role: null });

    await expect(abandon()).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

/**
 * Le bon de fidélité revient avec l'annulation (plan des points, C4), et
 * seulement avec elle : un règlement pro tombé se reprend, le rendre ouvrirait
 * la double dépense (D7).
 */
describe("AbandonOrderHandler — le bon de fidélité", () => {
  it("libère le bon quand l'abandon a annulé la commande", async () => {
    const { abandon, vouchers } = build({ voucher: "v1" });

    await abandon();

    expect(vouchers.calls).toEqual(["release:v1"]);
  });

  it("ne libère rien quand l'abandon n'a écrit que le refus (pro)", async () => {
    const { abandon, vouchers } = build({
      voucher: "v1",
      written: "failed",
      companyId: "cmp_1",
      role: "orders",
      clientele: "pro",
    });

    await abandon();

    expect(vouchers.calls).toEqual([]);
  });

  it("ne libère rien quand rien n'a franchi (second clic)", async () => {
    const { abandon, vouchers } = build({ voucher: "v1", written: null });

    await abandon();

    expect(vouchers.calls).toEqual([]);
  });

  it("ne demande rien à la fidélité sans bon", async () => {
    const { abandon, vouchers } = build();

    await abandon();

    expect(vouchers.calls).toEqual([]);
  });
});
