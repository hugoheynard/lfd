import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { IntentCancellation } from "../../../../payments/domain/payment-gateway.js";
import type { OrderWithdrawalOutcome } from "../../../../../production/channels/commerce/index.js";
import {
  CancellationReasonRequiredError,
  OrderCancellationNotRecordedError,
  OrderCancellationPaymentInProgressError,
  OrderCancellationProviderUnavailableError,
  OrderNotCancellableError,
} from "../../../domain/errors/order-cancellation-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderCancelledEvent } from "../../../domain/events/order-cancelled.event.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";
import { CancelOrderCommand } from "../cancel-order.command.js";
import { CancelOrderHandler } from "../cancel-order.handler.js";
import {
  cancellationSubject,
  FixedSubjects,
  InMemoryCancellations,
  ScriptedCancelGateway,
  ScriptedDesk,
} from "./cancellation-doubles.js";
import { RecordingDurable } from "./durable-doubles.js";
import { RecordingRedemption } from "./voucher-doubles.js";

/**
 * L'annulation staff, orchestrée (plan `order/plan-annulation-de-commande.md`,
 * C3.4 à C3.4 ter) : Stripe AVANT la transaction, le verrou de ligne, le
 * retrait au fournil, l'écriture conditionnée, le bon et le fait — dans cet
 * ordre, et rien quand un refus tombe.
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge — exception étroite du §5. */
const NOW = new Date("2026-10-12T15:00:00.000Z");
const STAFF = "fiche-marie";

interface Scene {
  readonly subject?: CancellationSubject;
  readonly stripe?: IntentCancellation;
  readonly desk?: OrderWithdrawalOutcome;
  readonly failures?: number;
}

function scene(options: Scene = {}) {
  const trace: string[] = [];
  const subject = options.subject ?? cancellationSubject();
  const rows = new InMemoryCancellations(subject, trace);
  rows.failures = options.failures ?? 0;
  const gateway = new ScriptedCancelGateway(options.stripe ?? { kind: "cancelled" }, trace);
  const vouchers = new RecordingRedemption();
  const durable = new RecordingDurable();
  const handler = new CancelOrderHandler(
    new FixedSubjects(subject),
    rows,
    gateway,
    new ScriptedDesk(options.desk ?? "withdrawn", trace),
    vouchers,
    durable,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { handler, trace, rows, gateway, vouchers, durable };
}

const cancel = (reason = "Le client a appelé : il part en vacances") =>
  new CancelOrderCommand("ord_1", STAFF, reason);

function eventOf(regime: "free" | "due", voucherReturned = false): OrderCancelledEvent {
  return new OrderCancelledEvent(
    "ord_1",
    "CMD-0001",
    "usr_1",
    STAFF,
    "Le client a appelé : il part en vacances",
    regime,
    voucherReturned,
  );
}

describe("CancelOrderHandler — carte non payée (décision 7)", () => {
  it("ferme l'intention chez Stripe AVANT la transaction, puis verrou, retrait, écriture", async () => {
    const { handler, trace, rows, durable } = scene();

    await handler.execute(cancel());

    expect(trace).toEqual([
      "stripe:pi_1",
      "lock:ord_1",
      "withdraw:2026-10-13:ord_1",
      "cancel:ord_1",
    ]);
    expect(rows.records).toEqual([
      { cancelledBy: STAFF, reason: "Le client a appelé : il part en vacances", cancelledAt: NOW },
    ]);
    expect(durable.facts).toEqual([eventOf("due").durableFact()]);
  });

  it("une intention déjà annulée (second clic chez Stripe) laisse écrire", async () => {
    const { handler, rows } = scene({ stripe: { kind: "already_cancelled" } });

    await handler.execute(cancel());

    expect(rows.records).toHaveLength(1);
  });

  it("une carte sans intention s'annule sans appeler Stripe", async () => {
    const { handler, gateway, rows } = scene({
      subject: cancellationSubject({ stripePaymentIntentId: null }),
    });

    await handler.execute(cancel());

    expect(gateway.cancelled).toEqual([]);
    expect(rows.records).toHaveLength(1);
  });

  it.each<[string, IntentCancellation, new (...args: never[]) => Error]>([
    ["payée entre-temps", { kind: "already_paid" }, OrderNotCancellableError],
    ["paiement en traitement", { kind: "in_progress" }, OrderCancellationPaymentInProgressError],
    [
      "Stripe injoignable",
      { kind: "unavailable", reason: "ECONNRESET" },
      OrderCancellationProviderUnavailableError,
    ],
  ])(
    "Stripe refuse (%s) : rien n'est écrit, la base n'est pas touchée",
    async (_, outcome, error) => {
      const { handler, trace, durable } = scene({ stripe: outcome });

      await expect(handler.execute(cancel())).rejects.toBeInstanceOf(error);

      expect(trace).toEqual(["stripe:pi_1"]);
      expect(durable.facts).toEqual([]);
    },
  );

  it("le bon engagé sur une carte non payée est rendu, une fois, et le fait le dit", async () => {
    const { handler, vouchers, durable } = scene({
      subject: cancellationSubject({ loyaltyVoucherId: "bon_1" }),
    });

    await handler.execute(cancel());

    expect(vouchers.calls).toEqual(["release:bon_1"]);
    expect(durable.facts).toEqual([eventOf("due", true).durableFact()]);
  });
});

describe("CancelOrderHandler — total nul", () => {
  const FREE = cancellationSubject({
    paymentStatus: "not_required",
    totalCents: 0,
    stripePaymentIntentId: null,
  });

  it("n'appelle pas Stripe, retire du fournil, écrit et publie", async () => {
    const { handler, trace, durable } = scene({ subject: FREE });

    await handler.execute(cancel());

    expect(trace).toEqual(["lock:ord_1", "withdraw:2026-10-13:ord_1", "cancel:ord_1"]);
    expect(durable.facts).toEqual([eventOf("free").durableFact()]);
  });

  it("⚠️ refuse un total nul qui porte un bon déjà soldé à la passation (hors plan, en attente)", async () => {
    const { handler, trace } = scene({ subject: { ...FREE, loyaltyVoucherId: "bon_1" } });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.voucher_settled",
    });
    expect(trace).toEqual([]);
  });

  it("une commande sans jour de service n'a rien à retirer au fournil", async () => {
    const { handler, trace } = scene({ subject: { ...FREE, serviceDay: null } });

    await handler.execute(cancel());

    expect(trace).toEqual(["lock:ord_1", "cancel:ord_1"]);
  });
});

describe("CancelOrderHandler — les refus", () => {
  it("le fournil l'a inscrite : refus nommé, rien n'est écrit ni publié", async () => {
    const { handler, trace, durable } = scene({ desk: "inscribed" });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.inscribed",
      message: expect.stringContaining("du 13/10") as string,
    });
    expect(trace).not.toContain("cancel:ord_1");
    expect(durable.facts).toEqual([]);
  });

  it("l'écriture ne franchit pas (0 ligne) : refus, ni bon rendu ni fait", async () => {
    const { handler, rows, vouchers, durable } = scene({
      subject: cancellationSubject({ loyaltyVoucherId: "bon_1" }),
    });
    rows.refuseWrite = true;

    await expect(handler.execute(cancel())).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(vouchers.calls).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("déjà annulée au premier regard : « déjà annulée », sans appeler Stripe", async () => {
    const { handler, gateway } = scene({
      subject: cancellationSubject({ status: "cancelled", cancelledAt: NOW }),
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.already_cancelled",
    });
    expect(gateway.cancelled).toEqual([]);
  });

  it("annulée entre le premier regard et le verrou (second clic) : refus sous verrou", async () => {
    const { handler, rows, durable } = scene();
    rows.current = cancellationSubject({ status: "cancelled", cancelledAt: NOW });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.already_cancelled",
    });
    expect(rows.records).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it.each([
    ["au compte", { paymentStatus: "not_required", totalCents: 2_110 }, "orders.cancel.account"],
    ["payée", { paymentStatus: "paid" }, "orders.cancel.paid"],
    ["prête", { status: "ready" }, "orders.cancel.ready"],
    ["retirée", { status: "fulfilled" }, "orders.cancel.fulfilled"],
  ] as const)("refuse une commande %s, sans rien appeler", async (_, overrides, code) => {
    const { handler, trace } = scene({ subject: cancellationSubject(overrides) });

    await expect(handler.execute(cancel())).rejects.toMatchObject({ code });
    expect(trace).toEqual([]);
  });

  it("refuse un motif vide avant toute lecture", async () => {
    const { handler, trace } = scene();

    await expect(handler.execute(cancel("   "))).rejects.toBeInstanceOf(
      CancellationReasonRequiredError,
    );
    expect(trace).toEqual([]);
  });

  it("404 sur une commande inconnue", async () => {
    const handler = new CancelOrderHandler(
      new FixedSubjects(null),
      new InMemoryCancellations(null),
      new ScriptedCancelGateway({ kind: "cancelled" }),
      new ScriptedDesk(),
      new RecordingRedemption(),
      new RecordingDurable(),
      new DirectUnitOfWork(),
      new FixedClock(NOW),
    );

    await expect(handler.execute(cancel())).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

describe("CancelOrderHandler — la transaction qui échoue après Stripe (C3.4 ter)", () => {
  it("rejoue UNE fois dans la requête : le second essai écrit, un seul fait", async () => {
    const { handler, trace, durable } = scene({ failures: 1 });

    await handler.execute(cancel());

    expect(trace.filter((step) => step === "stripe:pi_1")).toHaveLength(1);
    expect(trace.filter((step) => step === "lock:ord_1")).toHaveLength(2);
    expect(durable.facts).toHaveLength(1);
  });

  it("deux échecs : 500 qui dit de relancer, et rien n'est écrit", async () => {
    const { handler, rows, durable } = scene({ failures: 2 });

    const failure = handler.execute(cancel());

    await expect(failure).rejects.toBeInstanceOf(OrderCancellationNotRecordedError);
    await expect(failure).rejects.toMatchObject({
      message: expect.stringContaining("Relancez l'annulation") as string,
    });
    expect(rows.records).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("sans fermeture chez Stripe, une panne ne se rejoue pas : elle remonte telle quelle", async () => {
    const { handler, trace } = scene({
      subject: cancellationSubject({ stripePaymentIntentId: null }),
      failures: 1,
    });

    await expect(handler.execute(cancel())).rejects.toThrow("la connexion à la base est tombée");
    expect(trace).toEqual(["lock:ord_1"]);
  });

  it("un REFUS après Stripe ne se rejoue pas : il dirait la même chose", async () => {
    const { handler, trace } = scene({ desk: "inscribed" });

    await expect(handler.execute(cancel())).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(trace.filter((step) => step === "lock:ord_1")).toHaveLength(1);
  });
});
