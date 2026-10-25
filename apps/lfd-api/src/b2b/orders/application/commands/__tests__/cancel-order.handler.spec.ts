import { FixedHandoverHistory } from "./handover-history-double.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { CommerceOrderCancelledFact } from "../../../../../delivery/channels/commerce/index.js";
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
import {
  OrderCancelledEvent,
  type CancelledOrderVoucher,
} from "../../../domain/events/order-cancelled.event.js";
import type { VoucherRestitution } from "../../../domain/ports/loyalty-voucher-redemption.js";
import { VoucherRestitutionRefusal } from "../../services/voucher-restitution-refusal.js";
import { CancellationAllowanceGate } from "../../services/cancellation-allowance-gate.js";
import { FixedCancellationSettings } from "./customer-cancellation-doubles.js";
import { CancellationRule } from "../../services/cancellation-rule.js";
import type { AccountEngagement } from "../../../domain/ports/account-order-engagement.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";
import { CancelOrderCommand } from "../cancel-order.command.js";
import { CancelOrderHandler } from "../cancel-order.handler.js";
import { OrderCancellation } from "../../services/order-cancellation.service.js";
import {
  cancellationSubject,
  FixedInscriptions,
  FixedSubjects,
  InMemoryCancellations,
  ScriptedCancelGateway,
  ScriptedDesk,
  workshops,
  RecordingNoteVoiding,
  ScriptedEngagements,
} from "./cancellation-doubles.js";
import { RecordingDurable } from "./durable-doubles.js";
import { CancellationRefundRequester } from "../../services/cancellation-refund-requester.js";
import { InMemoryRefundRequests, RecordingDispatch, RefundStore } from "./refund-doubles.js";
import { RecordingRedemption, RETURNED } from "./voucher-doubles.js";

/** La livraison apprend l'annulation (lot T2 du transfert interne), dans la même transaction. */
const WITHDRAWN = new CommerceOrderCancelledFact("ord_1").durableFact();

/**
 * L'annulation staff, orchestrée (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
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
  readonly restitution?: VoucherRestitution;
  /** Les autres commandes, par id — celle qui porte un reliquat (cas 5). */
  readonly others?: Readonly<Record<string, CancellationSubject>>;
  /** Lot C5 : l'engagement comptable lu hors verrou, puis sous verrou. */
  readonly engagement?: AccountEngagement | null;
  readonly engagementUnderLock?: AccountEngagement | null;
  /** C3.6 : les commandes que le comptoir a déjà attestées. */
  readonly handedOver?: readonly string[];
}

function scene(options: Scene = {}) {
  const trace: string[] = [];
  const subject = options.subject ?? cancellationSubject();
  const rows = new InMemoryCancellations(subject, trace);
  rows.failures = options.failures ?? 0;
  const gateway = new ScriptedCancelGateway(options.stripe ?? { kind: "cancelled" }, trace);
  const vouchers = new RecordingRedemption(false, options.restitution ?? RETURNED);
  const durable = new RecordingDurable();
  const subjects = new FixedSubjects(subject, options.others ?? {});
  const first = options.engagement === undefined ? { kind: "free" as const } : options.engagement;
  const engagements = new ScriptedEngagements(
    first,
    trace,
    options.engagementUnderLock === undefined ? first : options.engagementUnderLock,
  );
  const rule = new CancellationRule(engagements);
  const refundStore = new RefundStore();
  const dispatch = new RecordingDispatch();
  const handler = new CancelOrderHandler(
    new OrderCancellation(
      subjects,
      rows,
      gateway,
      workshops(new ScriptedDesk(options.desk ?? "withdrawn", trace)),
      vouchers,
      new VoucherRestitutionRefusal(subjects, new FixedInscriptions(), rule),
      rule,
      new CancellationAllowanceGate(new FixedCancellationSettings()),
      engagements,
      new CancellationRefundRequester(new InMemoryRefundRequests(refundStore), dispatch),
      durable,
      new RecordingNoteVoiding(),
      new DirectUnitOfWork(),
      new FixedClock(NOW),
      new FixedHandoverHistory(options.handedOver),
    ),
  );
  return { handler, trace, rows, gateway, vouchers, durable, engagements, refundStore, dispatch };
}

const cancel = (reason = "Le client a appelé : il part en vacances") =>
  new CancelOrderCommand("ord_1", STAFF, reason);

function eventOf(
  regime: "free" | "due" | "account" | "paid",
  voucher: CancelledOrderVoucher | null = null,
  refund: { readonly announcedCents: number } | null = null,
): OrderCancelledEvent {
  return new OrderCancelledEvent(
    "ord_1",
    "ORD-0001",
    "usr_1",
    STAFF,
    "Le client a appelé : il part en vacances",
    regime,
    voucher,
    refund,
  );
}

/** Ce que le fait dit d'un bon rendu par {@link RETURNED}. */
const RETURNED_IN_FACT: CancelledOrderVoucher = {
  outcome: "returned",
  voucherValueCents: 1_200,
  remainderValueCents: null,
  expiresAt: new Date(Date.UTC(2030, 10, 30, 12)),
};

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
    expect(durable.facts).toEqual([eventOf("due").durableFact(), WITHDRAWN]);
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

  it("une carte qui aboutit pendant le clic refuse `paid_just_now`, sans rien écrire (C4.6)", async () => {
    const { handler, durable } = scene({ stripe: { kind: "already_paid" } });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.paid_just_now",
    });
    expect(durable.facts).toEqual([]);
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

  it("le bon engagé sur une carte non payée est restitué, une fois, et le fait le dit", async () => {
    const { handler, vouchers, durable } = scene({
      subject: cancellationSubject({ loyaltyVoucherId: "bon_1" }),
    });

    await handler.execute(cancel());

    expect(vouchers.calls).toEqual(["reinstate:bon_1>ord_1"]);
    expect(durable.facts).toEqual([eventOf("due", RETURNED_IN_FACT).durableFact(), WITHDRAWN]);
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
    expect(durable.facts).toEqual([eventOf("free").durableFact(), WITHDRAWN]);
  });

  it("un total nul qui porte un bon s'annule : le bon est restitué (lot C3b)", async () => {
    const merged: VoucherRestitution = {
      kind: "merged",
      voucherValueCents: 1_200,
      remainderValueCents: 450,
      expiresAt: RETURNED_IN_FACT.expiresAt,
    };
    const { handler, vouchers, durable } = scene({
      subject: { ...FREE, loyaltyVoucherId: "bon_1" },
      restitution: merged,
    });

    await handler.execute(cancel());

    expect(vouchers.calls).toEqual(["reinstate:bon_1>ord_1"]);
    expect(durable.facts).toEqual([
      eventOf("free", {
        outcome: "merged",
        voucherValueCents: 1_200,
        remainderValueCents: 450,
        expiresAt: RETURNED_IN_FACT.expiresAt,
      }).durableFact(),
      WITHDRAWN,
    ]);
  });

  it("un bon déjà rendu (`already`) : l'annulation s'écrit, le fait ne cite pas le bon", async () => {
    const { handler, durable } = scene({
      subject: { ...FREE, loyaltyVoucherId: "bon_1" },
      restitution: { kind: "already" },
    });

    await handler.execute(cancel());

    expect(durable.facts).toEqual([eventOf("free").durableFact(), WITHDRAWN]);
  });

  it("cas 5, l'autre commande s'annule : refus qui propose de l'annuler d'abord, rien publié", async () => {
    const { handler, durable } = scene({
      subject: { ...FREE, loyaltyVoucherId: "bon_1" },
      restitution: {
        kind: "blocked",
        cause: "remainder_engaged",
        remainderValueCents: 450,
        order: { id: "ord_2", number: "C-2" },
      },
      others: { ord_2: { ...FREE, orderId: "ord_2", orderNumber: "C-2" } },
    });

    const refusal = handler.execute(cancel());

    await expect(refusal).rejects.toBeInstanceOf(OrderNotCancellableError);
    const error: unknown = await refusal.catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "orders.cancel.voucher_remainder_engaged" });
    expect(error instanceof Error ? error.message : "").toContain(
      "C-2 : annulez-la d'abord, puis celle-ci.",
    );
    expect(durable.facts).toEqual([]);
  });

  it("cas 5, l'autre commande ne s'annule plus : la phrase ne le propose pas", async () => {
    const { handler } = scene({
      subject: { ...FREE, loyaltyVoucherId: "bon_1" },
      restitution: {
        kind: "blocked",
        cause: "remainder_engaged",
        remainderValueCents: 450,
        order: { id: "ord_2", number: "C-2" },
      },
      others: { ord_2: { ...FREE, orderId: "ord_2", status: "fulfilled" } },
    });

    const error: unknown = await handler.execute(cancel()).catch((caught: unknown) => caught);
    expect(error instanceof Error ? error.message : "").toContain("qui ne peut plus être annulée");
  });

  it("cas 6, reste annulé par l'équipe : refus, rien publié", async () => {
    const { handler, durable } = scene({
      subject: { ...FREE, loyaltyVoucherId: "bon_1" },
      restitution: { kind: "blocked", cause: "remainder_cancelled", remainderValueCents: 450 },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.voucher_remainder_cancelled",
    });
    expect(durable.facts).toEqual([]);
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

  /**
   * Régression (2026-10-25) : le comptoir remettait la commande pendant
   * l'annulation, et les deux passaient — attestation orpheline sur une
   * commande annulée et remboursée. Sous le verrou, l'attestation se voit.
   */
  it("retirée au comptoir pendant le clic : refus sous verrou, ni retrait au fournil ni écriture", async () => {
    const { handler, rows, trace, durable } = scene({ handedOver: ["ord_1"] });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.fulfilled",
    });
    expect(rows.records).toEqual([]);
    expect(trace.filter((step) => step.startsWith("withdraw:"))).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it.each([
    [
      "payée, un remboursement en vol",
      { paymentStatus: "paid", refunds: { refundableCents: 2_110, inFlightCents: 500 } },
      "orders.cancel.refund_in_flight",
    ],
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
      new OrderCancellation(
        new FixedSubjects(null),
        new InMemoryCancellations(null),
        new ScriptedCancelGateway({ kind: "cancelled" }),
        workshops(new ScriptedDesk()),
        new RecordingRedemption(),
        new VoucherRestitutionRefusal(
          new FixedSubjects(null),
          new FixedInscriptions(),
          new CancellationRule(new ScriptedEngagements()),
        ),
        new CancellationRule(new ScriptedEngagements()),
        new CancellationAllowanceGate(new FixedCancellationSettings()),
        new ScriptedEngagements(),
        new CancellationRefundRequester(
          new InMemoryRefundRequests(new RefundStore()),
          new RecordingDispatch(),
        ),
        new RecordingDurable(),
        new RecordingNoteVoiding(),
        new DirectUnitOfWork(),
        new FixedClock(NOW),
        new FixedHandoverHistory(),
      ),
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
    expect(durable.facts).toHaveLength(2);
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

describe("CancelOrderHandler — au compte (lot C5)", () => {
  const ACCOUNT = cancellationSubject({
    paymentStatus: "not_required",
    totalCents: 2_110,
    stripePaymentIntentId: null,
  });

  it("rien d'engagé : engagement lu hors verrou PUIS sous verrou, ligne fermée dans la transaction, sans Stripe", async () => {
    const { handler, trace, gateway, durable, engagements } = scene({ subject: ACCOUNT });

    await handler.execute(cancel());

    expect(trace).toEqual([
      "engagement:ord_1",
      "lock:ord_1",
      "engagement:ord_1",
      "withdraw:2026-10-13:ord_1",
      "cancel:ord_1",
      "close:ord_1",
    ]);
    expect(gateway.cancelled).toEqual([]);
    expect(engagements.closed).toEqual([{ orderId: "ord_1", amountCents: 2_110, at: NOW }]);
    expect(durable.facts).toEqual([eventOf("account").durableFact(), WITHDRAWN]);
  });

  it("facturée au premier regard : refus nommé, sans verrou ni retrait ni fermeture", async () => {
    const { handler, trace, engagements } = scene({
      subject: ACCOUNT,
      engagement: { kind: "invoiced", invoiceNumber: "FA-LFD-2026-000012", issuedOn: "2026-09-30" },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.invoiced",
      message: expect.stringContaining(
        "facturée le 30/09/2026 (facture n° FA-LFD-2026-000012)",
      ) as string,
    });
    expect(trace).toEqual(["engagement:ord_1"]);
    expect(engagements.closed).toEqual([]);
  });

  it("entrée dans un lot entre le premier regard et le verrou : la relecture sous verrou refuse, rien ne bouge", async () => {
    const { handler, trace, vouchers, durable, engagements } = scene({
      subject: { ...ACCOUNT, loyaltyVoucherId: "bon_1" },
      engagementUnderLock: {
        kind: "collecting",
        state: "batched",
        collectionDay: "2026-10-20",
        statementNumber: null,
      },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.collecting",
    });
    expect(trace).toEqual(["engagement:ord_1", "lock:ord_1", "engagement:ord_1"]);
    expect(vouchers.calls).toEqual([]);
    expect(durable.facts).toEqual([]);
    expect(engagements.closed).toEqual([]);
  });

  it("engagement illisible au compte : refus `engagement_unknown`, jamais « annulable » (S6)", async () => {
    const { handler, trace } = scene({ subject: ACCOUNT, engagement: null });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.engagement_unknown",
    });
    expect(trace).toEqual(["engagement:ord_1"]);
  });

  it("hors régime au compte, la comptabilité n'est pas interrogée", async () => {
    const { handler, trace } = scene();

    await handler.execute(cancel());

    expect(trace.filter((step) => step.startsWith("engagement:"))).toEqual([]);
    expect(trace).not.toContain("close:ord_1");
  });
});

describe("CancelOrderHandler — carte payée, avec remboursement (lot C4)", () => {
  const PAID = cancellationSubject({
    paymentStatus: "paid",
    refunds: { refundableCents: 2_110, inFlightCents: 0 },
  });

  it("n'appelle JAMAIS Stripe : la demande s'écrit dans la transaction, l'exécuteur part après", async () => {
    const { handler, trace, gateway, durable, refundStore, dispatch } = scene({ subject: PAID });

    await handler.execute(cancel());

    expect(gateway.cancelled).toEqual([]);
    expect(trace).toEqual(["lock:ord_1", "withdraw:2026-10-13:ord_1", "cancel:ord_1"]);
    expect(refundStore.request).toMatchObject({
      orderId: "ord_1",
      cause: "cancellation",
      announcedCents: 2_110,
      requestedAt: NOW,
      requestedBy: STAFF,
      generation: 1,
      round: 1,
      attempts: 0,
      stripeRefundId: null,
      nextAttemptAt: NOW,
    });
    expect(dispatch.dispatched).toEqual(["ord_1"]);
    expect(durable.facts).toEqual([
      eventOf("paid", null, { announcedCents: 2_110 }).durableFact(),
      WITHDRAWN,
    ]);
  });

  it("le montant promis est celui relu SOUS le verrou, pas au premier regard", async () => {
    const { handler, rows, refundStore } = scene({ subject: PAID });
    rows.current = { ...PAID, refunds: { refundableCents: 1_000, inFlightCents: 0 } };

    await handler.execute(cancel());

    expect(refundStore.request?.announcedCents).toBe(1_000);
  });

  it("déjà rendue en entier depuis Stripe : annulée sans demande, le fait dit `refund: null`", async () => {
    const refunded = cancellationSubject({ paymentStatus: "refunded" });
    const { handler, refundStore, dispatch, durable } = scene({ subject: refunded });

    await handler.execute(cancel());

    expect(refundStore.request).toBeNull();
    expect(dispatch.dispatched).toEqual([]);
    expect(durable.facts).toEqual([eventOf("paid").durableFact(), WITHDRAWN]);
  });

  it("inscrite au fournil : ni demande, ni fait", async () => {
    const { handler, refundStore, dispatch, durable } = scene({ subject: PAID, desk: "inscribed" });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.inscribed",
    });
    expect(refundStore.request).toBeNull();
    expect(dispatch.dispatched).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("un bon qui refuse (cas 6) annule tout : ni demande, ni fait", async () => {
    const { handler, refundStore, durable } = scene({
      subject: { ...PAID, loyaltyVoucherId: "bon_1" },
      restitution: { kind: "blocked", cause: "remainder_cancelled", remainderValueCents: 450 },
    });

    await expect(handler.execute(cancel())).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(refundStore.request).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("une panne de transaction ne se rejoue pas : Stripe n'a rien fait", async () => {
    const { handler, trace, refundStore } = scene({ subject: PAID, failures: 1 });

    await expect(handler.execute(cancel())).rejects.toThrow("la connexion à la base est tombée");
    expect(trace).toEqual(["lock:ord_1"]);
    expect(refundStore.request).toBeNull();
  });
});
