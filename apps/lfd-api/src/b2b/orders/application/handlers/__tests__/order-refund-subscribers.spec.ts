import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderRefundState } from "../../../domain/entities/order-refund.js";
import {
  ORDER_REFUND_FAILED,
  ORDER_REFUND_REVERSED,
  OrderRefundFailedFact,
} from "../../../domain/events/order-refund-failed.fact.js";
import { OrderPaidAfterCancellationEvent } from "../../../domain/events/order-paid-after-cancellation.event.js";
import { RefundAttentionBell } from "../../services/refund-attention-bell.js";
import {
  cancellationSubject,
  FixedSubjects,
} from "../../commands/__tests__/cancellation-doubles.js";
import {
  InMemoryLedgers,
  InMemoryRefundReader,
  InMemoryRefundRequests,
  ORDER_ID,
  RecordingDispatch,
  RecordingNotifier,
  RefundStore,
} from "../../commands/__tests__/refund-doubles.js";
import { RefundPaidAfterCancellation } from "../refund-paid-after-cancellation.handler.js";
import { ReopenRefundOnReversal } from "../reopen-refund-on-reversal.handler.js";
import { RingRefundFailed } from "../ring-refund-failed.handler.js";

/**
 * Les abonnés du lot C4 (plan `order/plan-annulation-de-commande.md`, C4.7,
 * C4.11, C4.11 bis). Instants comparés entre eux — exception étroite du §5.
 */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));

function refund(status: OrderRefundState["status"], amountCents = 2_340): OrderRefundState {
  return {
    id: "ref_1",
    stripeRefundId: "re_1",
    amountCents,
    currency: "eur",
    status,
    refundedAt: NOW,
    recordedAt: NOW,
    updatedAt: NOW,
    creditNoteId: null,
  };
}

function delivery(type: string, payload: Readonly<Record<string, unknown>>): DurableDelivery {
  return { eventId: "evt_1", type, payload };
}

describe("RefundPaidAfterCancellation — l'encaissé après annulation se rembourse seul (C4.11)", () => {
  function build() {
    const store = new RefundStore();
    store.paymentStatus = "failed";
    const dispatch = new RecordingDispatch();
    const handler = new RefundPaidAfterCancellation(
      new InMemoryLedgers(store),
      new InMemoryRefundRequests(store),
      dispatch,
      new FixedClock(NOW),
    );
    const fact = new OrderPaidAfterCancellationEvent(ORDER_ID).durableFact();
    return { store, dispatch, run: () => handler.handle(delivery(fact.type, fact.payload)) };
  }

  it("ouvre une demande automatique du reste, due tout de suite, et lance l'exécuteur", async () => {
    const { store, dispatch, run } = build();

    await run();

    expect(store.request).toMatchObject({
      cause: "paid_after_cancellation",
      announcedCents: 2_340,
      requestedBy: null,
      nextAttemptAt: NOW,
    });
    expect(dispatch.dispatched).toEqual([ORDER_ID]);
  });

  it("relivré : la demande existe déjà, rien de plus", async () => {
    const { store, dispatch, run } = build();
    await run();
    await run();

    expect(dispatch.dispatched).toEqual([ORDER_ID]);
    expect(store.request?.generation).toBe(1);
  });

  it("le reste est nul (remboursée depuis le tableau de bord) : rien", async () => {
    const { store, dispatch, run } = build();
    store.refunds = [refund("succeeded")];

    await run();

    expect(store.request).toBeNull();
    expect(dispatch.dispatched).toEqual([]);
  });
});

describe("RingRefundFailed — le re_… d'une demande a échoué (C4.7)", () => {
  function build() {
    const store = new RefundStore();
    const notifier = new RecordingNotifier();
    const handler = new RingRefundFailed(
      new InMemoryRefundReader(store),
      new RefundAttentionBell(notifier, new FixedClock(NOW)),
    );
    const fact = new OrderRefundFailedFact(ORDER_REFUND_FAILED, ORDER_ID, "ref_1", "re_1");
    return {
      store,
      notifier,
      run: () => handler.handle(delivery(ORDER_REFUND_FAILED, fact.durableFact().payload)),
    };
  }

  it("sonne « à traiter » quand c'est le re_… de la demande", async () => {
    const { store, notifier, run } = build();
    store.seedRequest(NOW, { stripeRefundId: "re_1", issuedAt: NOW });

    await run();

    expect(notifier.notices).toMatchObject([
      {
        kind: "order.refund_attention",
        subject: "Remboursement échoué chez Stripe — à traiter — CMD-0001",
        link: `/commandes/${ORDER_ID}`,
        idempotencyKey: `notification:order.refund_attention:${ORDER_ID}:1:failed`,
      },
    ]);
  });

  it.each([
    ["sans demande", (_: RefundStore) => undefined],
    [
      "un autre re_…",
      (store: RefundStore) => store.seedRequest(NOW, { stripeRefundId: "re_9", issuedAt: NOW }),
    ],
  ])("se tait : %s", async (_, seed) => {
    const { store, notifier, run } = build();
    seed(store);

    await run();

    expect(notifier.notices).toEqual([]);
  });
});

describe("ReopenRefundOnReversal — un remboursement réussi qui échoue ensuite (C4.11 bis)", () => {
  function build(status: "cancelled" | "placed" = "cancelled") {
    const store = new RefundStore();
    const notifier = new RecordingNotifier();
    const handler = new ReopenRefundOnReversal(
      new FixedSubjects(cancellationSubject({ status })),
      new InMemoryLedgers(store),
      new InMemoryRefundRequests(store),
      new RefundAttentionBell(notifier, new FixedClock(NOW)),
      new FixedClock(NOW),
    );
    const fact = new OrderRefundFailedFact(ORDER_REFUND_REVERSED, ORDER_ID, "ref_1", "re_1");
    return {
      store,
      notifier,
      run: () => handler.handle(delivery(ORDER_REFUND_REVERSED, fact.durableFact().payload)),
    };
  }

  it("sans demande : en ouvre une `refund_reversed`, SANS échéance (le bouton), et sonne", async () => {
    const { store, notifier, run } = build();
    store.refunds = [refund("failed")];

    await run();

    expect(store.request).toMatchObject({
      cause: "refund_reversed",
      announcedCents: 2_340,
      nextAttemptAt: null,
    });
    expect(notifier.notices).toHaveLength(1);
  });

  it("avec la demande dont c'est le re_… : génération suivante, sans échéance, et sonne", async () => {
    const { store, notifier, run } = build();
    store.seedRequest(NOW, { stripeRefundId: "re_1", issuedAt: NOW, nextAttemptAt: null });
    store.refunds = [refund("failed")];

    await run();

    expect(store.request).toMatchObject({
      generation: 2,
      stripeRefundId: null,
      nextAttemptAt: null,
    });
    expect(notifier.notices[0]?.idempotencyKey).toBe(
      `notification:order.refund_attention:${ORDER_ID}:1:failed`,
    );
  });

  it("une commande non annulée : rien", async () => {
    const { store, notifier, run } = build("placed");
    store.refunds = [refund("failed")];

    await run();

    expect(store.request).toBeNull();
    expect(notifier.notices).toEqual([]);
  });
});
