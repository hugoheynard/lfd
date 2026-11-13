import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { ORDER_BILLING_SETTLED } from "../../../domain/events/order-billing-settled.fact.js";
import type { ShortfallRefundCause } from "../../../domain/services/shortfall-refund.js";
import {
  paidLine,
  refundSubject,
  shortfallRefundScene,
} from "../../services/__tests__/shortfall-refund-doubles.js";
import { SHORTFALL_REFUND_REASON } from "../../services/shortfall-refund-money.js";
import { RefundShortfallOnBillingSettled } from "../refund-shortfall-on-billing-settled.handler.js";

/**
 * **L'abonné du reste au solde** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2, § 4.4,
 * § 4.6, § 9) — juger sous le verrou, puis écrire ; une cause va au journal,
 * l'abonné rend normalement.
 */

function delivery(billableTotalCents = 600, write = "closed"): DurableDelivery {
  return {
    eventId: "evt_1",
    type: ORDER_BILLING_SETTLED,
    payload: { orderId: "ord_1", write, billableTotalCents, settledOn: "2030-01-10" },
  };
}

function handlerOf(scene: ReturnType<typeof shortfallRefundScene>) {
  return new RefundShortfallOnBillingSettled(scene.refunding);
}

describe("RefundShortfallOnBillingSettled", () => {
  it("demande le reste exact, sous le verrou, après l'adoption", async () => {
    const scene = shortfallRefundScene(refundSubject());

    await handlerOf(scene).handle(delivery());

    expect(scene.trace).toEqual(["lock:ord_1", "adopt:ord_1", "request:pay_1:400"]);
    expect(scene.refunds.amounts).toEqual([
      {
        paymentId: "pay_1",
        amountCents: 400,
        nature: "adjustment",
        reason: SHORTFALL_REFUND_REASON,
        requestedBy: null,
      },
    ]);
    expect(scene.journal.facts).toEqual([]);
  });

  /**
   * Le relais peut livrer un `closed` APRÈS le `corrected` qui le suit : le
   * montant se lit sur le facturable relu sous le verrou, jamais sur le payload.
   */
  it("livraison inversée : le payload périmé ne change pas le montant", async () => {
    const scene = shortfallRefundScene(refundSubject({ billableTotalCents: 700 }));

    await handlerOf(scene).handle(delivery(600, "closed"));

    expect(scene.refunds.amounts.map((request) => request.amountCents)).toEqual([300]);
  });

  it("plusieurs paiements : une demande par paiement touché, le plus récent d'abord", async () => {
    const scene = shortfallRefundScene(
      refundSubject({ billableTotalCents: 900 }),
      [paidLine("pay_1", 1_000), paidLine("pay_2", 300, { role: "complement" })],
      null,
      ["pay_2"],
    );

    await handlerOf(scene).handle(delivery());

    expect(scene.refunds.amounts.map((r) => [r.paymentId, r.amountCents])).toEqual([
      ["pay_2", 300],
      ["pay_1", 100],
    ]);
  });

  it("rejeu : le second passage ne demande rien de plus", async () => {
    const scene = shortfallRefundScene(refundSubject());
    const handler = handlerOf(scene);

    await handler.handle(delivery());
    await handler.handle(delivery());

    expect(scene.refunds.amounts).toHaveLength(1);
    expect(scene.journal.facts).toEqual([]);
  });

  it("une correction à la baisse avant toute demande : le calcul est refait sur le facturable relu", async () => {
    const scene = shortfallRefundScene(refundSubject({ billableTotalCents: 800 }));
    const handler = handlerOf(scene);
    await handler.handle(delivery(800));
    scene.ledger.requests.length = 0;
    scene.refunds.amounts.length = 0;
    scene.subjects.subject = refundSubject({ billableTotalCents: 500 });

    await handler.handle(delivery(500, "corrected"));

    expect(scene.refunds.amounts.map((request) => request.amountCents)).toEqual([500]);
  });

  it("une baisse M2 déjà rendue est retranchée", async () => {
    const scene = shortfallRefundScene(refundSubject());
    scene.ledger.succeeded.push({
      refundId: "re_m2",
      paymentId: "pay_1",
      requestId: "req_m2",
      amountCents: 150,
      nature: "adjustment",
      source: "provider",
    });

    await handlerOf(scene).handle(delivery());

    expect(scene.refunds.amounts.map((request) => request.amountCents)).toEqual([250]);
  });

  it("commande non partielle : rien, ni verrou d'argent ni journal", async () => {
    const scene = shortfallRefundScene(refundSubject({ partial: false }));

    await handlerOf(scene).handle(delivery());

    expect(scene.trace).toEqual(["lock:ord_1"]);
    expect(scene.journal.facts).toEqual([]);
  });

  it("commande introuvable : rien, sans lever", async () => {
    const scene = shortfallRefundScene(null);

    await expect(handlerOf(scene).handle(delivery())).resolves.toBeUndefined();
    expect(scene.refunds.amounts).toEqual([]);
  });

  it.each<
    [ShortfallRefundCause, (scene: ReturnType<typeof shortfallRefundScene>) => void, number | null]
  >([
    [
      "already_invoiced",
      (scene) => (scene.subjects.subject = refundSubject({ invoiced: true })),
      null,
    ],
    [
      "increase_pending",
      (scene) => (scene.subjects.subject = refundSubject({ increasePending: true })),
      null,
    ],
    [
      "unattributed_refund",
      (scene) =>
        scene.ledger.succeeded.push({
          refundId: "re_x",
          paymentId: "pay_1",
          requestId: null,
          amountCents: 10,
          nature: null,
          source: "provider",
        }),
      null,
    ],
    [
      "payment_not_paid",
      (scene) => {
        // Le premier paiement n'est pas encaissé ; l'encaissé vient d'un autre.
        scene.ledger.payments.splice(0, 1, paidLine("pay_0", 500, { state: "failed" }));
        scene.ledger.payments.push(paidLine("pay_1", 1_000, { role: "complement" }));
      },
      400,
    ],
    [
      "not_covered",
      (scene) =>
        scene.ledger.requests.push({
          id: "req_ret",
          paymentId: "pay_1",
          nature: "return",
          state: "to_issue",
          reason: "cancellation",
          announcedCents: 700,
        }),
      400,
    ],
  ])("« %s » : journal, aucune demande, le fait est acquitté", async (cause, arrange, amount) => {
    const scene = shortfallRefundScene(refundSubject());
    arrange(scene);

    await expect(handlerOf(scene).handle(delivery())).resolves.toBeUndefined();

    expect(scene.refunds.amounts).toEqual([]);
    expect(scene.journal.facts).toEqual([
      {
        type: "order.shortfall_refund_blocked",
        subjectType: "order",
        subjectId: "ord_1",
        payload: { subjectLabel: "ORD-0001", cause, amountCents: amount, stoppedAmount: false },
      },
    ]);
  });

  it("un refus en phase 2 lève : la boîte d'envoi annule tout et relance", async () => {
    const scene = shortfallRefundScene(
      refundSubject({ billableTotalCents: 100 }),
      [paidLine("pay_1", 300), paidLine("pay_2", 400, { role: "complement" })],
      2,
      ["pay_2"],
    );

    await expect(handlerOf(scene).handle(delivery(100))).rejects.toThrow("refus du bloc carte");
    expect(scene.journal.facts).toEqual([]);
  });
});
